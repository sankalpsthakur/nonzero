// ---------------------------------------------------------------------------
// Broker Adapters — Kite (live), Paper, and Shadow
// ---------------------------------------------------------------------------
// The core principle: paper and live use the SAME order engine code path,
// only the broker adapter differs. This file provides all three adapters
// behind the shared BrokerAdapter interface defined in ./types.ts.
// ---------------------------------------------------------------------------

import {
  placeOrder as kitePlaceOrder,
  getPositions as kiteGetPositions,
  getOrders as kiteGetOrders,
  type OrderParams,
} from "@/lib/kite";
import { db } from "@/lib/db";
import type {
  BrokerAdapter,
  BrokerOrderStatus,
  Holding,
  OrderIntent,
  OrderResult,
  PaperFill,
  Position,
  ShadowOrderIntent,
  Signal,
  Tick,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Estimates brokerage + exchange fees for Indian equity markets.
 * Simplified model: flat 20 INR per executed order for intraday,
 * 0 for delivery (Zerodha pricing).
 */
function estimateFees(
  quantity: number,
  price: number,
  product: string,
): number {
  const turnover = quantity * price;
  // STT + exchange txn + SEBI + stamp duty (approximate)
  const regulatoryCharges = turnover * 0.00015;
  // Brokerage: 20 INR or 0.03% whichever is lower (intraday)
  const brokerage = product === "MIS" ? Math.min(20, turnover * 0.0003) : 0;
  return Math.round((regulatoryCharges + brokerage) * 100) / 100;
}

// ---------------------------------------------------------------------------
// KiteBrokerAdapter — Real Kite Connect
// ---------------------------------------------------------------------------

export class KiteBrokerAdapter implements BrokerAdapter {
  readonly name = "kite";
  readonly environment = "LIVE" as const;

  private accessToken: string;
  private apiKey: string;
  private tickSubscriptions: Map<string, () => void> = new Map();

  constructor(accessToken: string, apiKey: string) {
    this.accessToken = accessToken;
    this.apiKey = apiKey;
  }

  async placeOrder(intent: OrderIntent): Promise<OrderResult> {
    // Map Prisma OrderType enum (SL_M) to Kite API format (SL-M)
    const orderTypeMap: Record<string, OrderParams["order_type"]> = {
      MARKET: "MARKET",
      LIMIT: "LIMIT",
      SL: "SL",
      SL_M: "SL-M",
    };

    const params: OrderParams = {
      exchange: intent.exchange,
      tradingsymbol: intent.symbol,
      transaction_type: intent.transactionType,
      order_type: orderTypeMap[intent.orderType] ?? "MARKET",
      quantity: intent.quantity,
      product: intent.product,
      price: intent.price,
      trigger_price: intent.triggerPrice,
      tag: intent.tag,
    };

    try {
      const result = await kitePlaceOrder(
        this.accessToken,
        this.apiKey,
        params,
      );

      return {
        intentId: intent.id ?? generateId(),
        status: "SUBMITTED",
        brokerOrderId: result.order_id,
        message: "Order placed successfully via Kite",
        timestamp: new Date(),
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown Kite API error";
      return {
        intentId: intent.id ?? generateId(),
        status: "REJECTED",
        message,
        timestamp: new Date(),
      };
    }
  }

  async cancelOrder(
    brokerOrderId: string,
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const res = await fetch(
        `https://api.kite.trade/orders/regular/${brokerOrderId}`,
        {
          method: "DELETE",
          headers: {
            "X-Kite-Version": "3",
            Authorization: `token ${this.apiKey}:${this.accessToken}`,
          },
        },
      );

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return {
          success: false,
          message: `Cancel failed: ${res.status} ${res.statusText} – ${body}`,
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Unknown cancel error",
      };
    }
  }

  async getPositions(): Promise<Position[]> {
    const data = await kiteGetPositions(this.accessToken, this.apiKey);
    const positions = data.net as Array<Record<string, unknown>>;

    return positions.map((p) => ({
      symbol: p.tradingsymbol as string,
      exchange: p.exchange as string,
      quantity: p.quantity as number,
      averagePrice: p.average_price as number,
      lastPrice: p.last_price as number,
      pnl: p.pnl as number,
      product: p.product as Position["product"],
      value: (p.quantity as number) * (p.last_price as number),
    }));
  }

  async getOrders(): Promise<BrokerOrderStatus[]> {
    const orders = (await kiteGetOrders(
      this.accessToken,
      this.apiKey,
    )) as Array<Record<string, unknown>>;

    return orders.map((o) => ({
      brokerOrderId: o.order_id as string,
      status: o.status as string,
      filledQuantity: o.filled_quantity as number,
      pendingQuantity: o.pending_quantity as number,
      averagePrice: o.average_price as number,
      statusMessage: o.status_message as string | undefined,
      exchangeTimestamp: o.exchange_timestamp
        ? new Date(o.exchange_timestamp as string)
        : undefined,
    }));
  }

  async getHoldings(): Promise<Holding[]> {
    const res = await fetch(
      "https://api.kite.trade/portfolio/holdings",
      {
        method: "GET",
        headers: {
          "X-Kite-Version": "3",
          Authorization: `token ${this.apiKey}:${this.accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    if (!res.ok) {
      throw new Error(`Kite getHoldings failed: ${res.status}`);
    }

    const json = await res.json();
    const holdings = json.data as Array<Record<string, unknown>>;

    return holdings.map((h) => ({
      symbol: h.tradingsymbol as string,
      exchange: h.exchange as string,
      quantity: h.quantity as number,
      averagePrice: h.average_price as number,
      lastPrice: h.last_price as number,
      pnl: h.pnl as number,
      isin: h.isin as string | undefined,
    }));
  }

  streamTicks(
    instrumentTokens: number[],
    onTick: (ticks: Tick[]) => void,
  ): () => void {
    // Kite WebSocket: up to 3000 instruments per connection, up to 3 connections.
    // This is a placeholder implementation — real WebSocket integration requires
    // the KiteTicker library or a raw WebSocket connection to wss://ws.kite.trade.
    const subscriptionId = generateId();

    const ws = new WebSocket(
      `wss://ws.kite.trade?api_key=${this.apiKey}&access_token=${this.accessToken}`,
    );

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          a: "subscribe",
          v: instrumentTokens,
        }),
      );
      // Request full mode for depth data
      ws.send(
        JSON.stringify({
          a: "mode",
          v: ["full", instrumentTokens],
        }),
      );
    };

    ws.onmessage = (event) => {
      // Kite sends binary tick data; real implementation would parse
      // the binary protocol. For now we handle JSON fallback.
      try {
        if (typeof event.data === "string") {
          const parsed = JSON.parse(event.data);
          if (Array.isArray(parsed)) {
            onTick(parsed as Tick[]);
          }
        }
        // Binary tick parsing would go here in production.
      } catch {
        // Ignore parse errors on non-tick messages (e.g., heartbeats)
      }
    };

    const unsubscribe = () => {
      ws.close();
      this.tickSubscriptions.delete(subscriptionId);
    };

    this.tickSubscriptions.set(subscriptionId, unsubscribe);
    return unsubscribe;
  }
}

// ---------------------------------------------------------------------------
// PaperBrokerAdapter — Simulated fills
// ---------------------------------------------------------------------------

export interface PaperBrokerConfig {
  /** Base slippage in basis points (default: 5 bps = 0.05%). */
  slippageBps: number;
  /** Probability of simulated rejection (0 to 1, default: 0.01). */
  rejectionRate: number;
  /** Initial capital for the paper account. */
  initialCapital: number;
  /** Deployment ID this adapter is associated with. */
  deploymentId: string;
}

const DEFAULT_PAPER_CONFIG: PaperBrokerConfig = {
  slippageBps: 5,
  rejectionRate: 0.01,
  initialCapital: 1_000_000,
  deploymentId: "",
};

export class PaperBrokerAdapter implements BrokerAdapter {
  readonly name = "paper";
  readonly environment = "PAPER" as const;

  private config: PaperBrokerConfig;
  private positions: Map<string, Position> = new Map();
  private orderHistory: BrokerOrderStatus[] = [];
  private fills: PaperFill[] = [];
  private tickCallbacks: Map<string, (ticks: Tick[]) => void> = new Map();
  private latestTicks: Map<string, Tick> = new Map();

  constructor(config: Partial<PaperBrokerConfig> = {}) {
    this.config = { ...DEFAULT_PAPER_CONFIG, ...config };
  }

  /**
   * Simulate a fill with realistic slippage.
   * Slippage model: base slippage +/- random variance, always unfavourable.
   */
  simulateFill(intent: OrderIntent, marketPrice: number): PaperFill {
    const intentId = intent.id ?? generateId();

    // Simulate rejection
    if (Math.random() < this.config.rejectionRate) {
      return {
        intentId,
        symbol: intent.symbol,
        exchange: intent.exchange,
        transactionType: intent.transactionType,
        quantity: intent.quantity,
        fillPrice: 0,
        marketPrice,
        slippage: 0,
        fees: 0,
        timestamp: new Date(),
        rejected: true,
        rejectionReason: "Simulated rejection (paper broker random rejection)",
      };
    }

    // Compute slippage: unfavourable direction based on transaction type
    const slippageFraction = this.config.slippageBps / 10000;
    // Add variance: 0.5x to 1.5x of base slippage
    const variance = 0.5 + Math.random();
    const actualSlippage = slippageFraction * variance;

    // BUY: slippage makes price higher; SELL: slippage makes price lower
    const direction = intent.transactionType === "BUY" ? 1 : -1;
    const fillPrice =
      Math.round(marketPrice * (1 + direction * actualSlippage) * 100) / 100;

    const fees = estimateFees(intent.quantity, fillPrice, intent.product);

    return {
      intentId,
      symbol: intent.symbol,
      exchange: intent.exchange,
      transactionType: intent.transactionType,
      quantity: intent.quantity,
      fillPrice,
      marketPrice,
      slippage: Math.round((fillPrice - marketPrice) * 100) / 100,
      fees,
      timestamp: new Date(),
      rejected: false,
    };
  }

  async placeOrder(intent: OrderIntent): Promise<OrderResult> {
    const intentId = intent.id ?? generateId();
    const brokerOrderId = `PAPER-${generateId()}`;

    // Get latest market price for this symbol
    const tick = this.latestTicks.get(
      `${intent.exchange}:${intent.symbol}`,
    );

    // For LIMIT orders, use the limit price as market price reference;
    // for MARKET orders, use last tick or the intent price as fallback
    let marketPrice: number;
    if (intent.orderType === "LIMIT" && intent.price !== undefined) {
      marketPrice = intent.price;
    } else if (tick) {
      marketPrice = tick.lastPrice;
    } else if (intent.price !== undefined) {
      marketPrice = intent.price;
    } else {
      return {
        intentId,
        status: "REJECTED",
        message:
          "No market price available for paper fill. Subscribe to ticks first or provide a price.",
        timestamp: new Date(),
      };
    }

    const fill = this.simulateFill(
      { ...intent, id: intentId },
      marketPrice,
    );

    if (fill.rejected) {
      this.orderHistory.push({
        brokerOrderId,
        status: "REJECTED",
        filledQuantity: 0,
        pendingQuantity: intent.quantity,
        averagePrice: 0,
        statusMessage: fill.rejectionReason,
      });

      return {
        intentId,
        status: "REJECTED",
        brokerOrderId,
        message: fill.rejectionReason,
        timestamp: new Date(),
      };
    }

    // Update internal positions
    this.updatePosition(intent, fill);
    this.fills.push(fill);

    this.orderHistory.push({
      brokerOrderId,
      status: "COMPLETE",
      filledQuantity: intent.quantity,
      pendingQuantity: 0,
      averagePrice: fill.fillPrice,
    });

    // Persist to paper ledger in database
    try {
      await db.paperLedger.create({
        data: {
          deploymentId: this.config.deploymentId,
          timestamp: fill.timestamp,
          action: intent.transactionType === "BUY" ? "BUY" : "SELL",
          symbol: intent.symbol,
          quantity: intent.quantity,
          price: fill.fillPrice,
          fees: fill.fees,
        },
      });
    } catch {
      // Non-fatal: log persistence failure but don't block the fill
    }

    return {
      intentId,
      status: "FILLED",
      brokerOrderId,
      message: `Paper fill at ${fill.fillPrice} (slippage: ${fill.slippage})`,
      timestamp: fill.timestamp,
    };
  }

  async cancelOrder(
    brokerOrderId: string,
  ): Promise<{ success: boolean; message?: string }> {
    const order = this.orderHistory.find(
      (o) => o.brokerOrderId === brokerOrderId,
    );
    if (!order) {
      return { success: false, message: "Order not found" };
    }
    if (order.status === "COMPLETE" || order.status === "REJECTED") {
      return {
        success: false,
        message: `Cannot cancel order in ${order.status} status`,
      };
    }
    order.status = "CANCELLED";
    return { success: true };
  }

  async getPositions(): Promise<Position[]> {
    return Array.from(this.positions.values());
  }

  async getOrders(): Promise<BrokerOrderStatus[]> {
    return [...this.orderHistory];
  }

  async getHoldings(): Promise<Holding[]> {
    // Paper broker does not have delivery holdings, return CNC positions
    return Array.from(this.positions.values())
      .filter((p) => p.product === "CNC" && p.quantity > 0)
      .map((p) => ({
        symbol: p.symbol,
        exchange: p.exchange,
        quantity: p.quantity,
        averagePrice: p.averagePrice,
        lastPrice: p.lastPrice,
        pnl: p.pnl,
      }));
  }

  streamTicks(
    instrumentTokens: number[],
    onTick: (ticks: Tick[]) => void,
  ): () => void {
    // Paper broker can receive real tick data (e.g., from a replay feed
    // or a shared Kite WebSocket). Store the callback so ticks can be
    // injected externally via injectTicks().
    const id = generateId();
    this.tickCallbacks.set(id, onTick);

    return () => {
      this.tickCallbacks.delete(id);
    };
  }

  /**
   * Inject ticks into the paper broker (from a replay feed or shared WebSocket).
   * This updates internal price state and notifies subscribers.
   */
  injectTicks(ticks: Tick[]): void {
    for (const tick of ticks) {
      const key = `${tick.exchange}:${tick.tradingSymbol}`;
      this.latestTicks.set(key, tick);

      // Update position last prices
      const position = this.positions.get(key);
      if (position) {
        position.lastPrice = tick.lastPrice;
        position.value = position.quantity * tick.lastPrice;
        position.pnl =
          (tick.lastPrice - position.averagePrice) * position.quantity;
      }
    }

    // Notify all tick subscribers
    for (const callback of this.tickCallbacks.values()) {
      callback(ticks);
    }
  }

  /** Get all recorded paper fills. */
  getFills(): PaperFill[] {
    return [...this.fills];
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private updatePosition(intent: OrderIntent, fill: PaperFill): void {
    const key = `${intent.exchange}:${intent.symbol}`;
    const existing = this.positions.get(key);

    if (!existing) {
      // New position
      const direction = intent.transactionType === "BUY" ? 1 : -1;
      this.positions.set(key, {
        symbol: intent.symbol,
        exchange: intent.exchange,
        quantity: direction * intent.quantity,
        averagePrice: fill.fillPrice,
        lastPrice: fill.fillPrice,
        pnl: 0,
        product: intent.product,
        value: direction * intent.quantity * fill.fillPrice,
      });
      return;
    }

    // Update existing position
    if (intent.transactionType === "BUY") {
      if (existing.quantity >= 0) {
        // Adding to long position: weighted average price
        const totalCost =
          existing.averagePrice * existing.quantity +
          fill.fillPrice * intent.quantity;
        const newQuantity = existing.quantity + intent.quantity;
        existing.averagePrice =
          newQuantity > 0 ? totalCost / newQuantity : 0;
        existing.quantity = newQuantity;
      } else {
        // Covering short position
        existing.quantity += intent.quantity;
        if (existing.quantity > 0) {
          existing.averagePrice = fill.fillPrice;
        }
      }
    } else {
      // SELL
      if (existing.quantity <= 0) {
        // Adding to short position
        const totalCost =
          Math.abs(existing.averagePrice * existing.quantity) +
          fill.fillPrice * intent.quantity;
        const newQuantity = existing.quantity - intent.quantity;
        existing.averagePrice =
          newQuantity !== 0 ? totalCost / Math.abs(newQuantity) : 0;
        existing.quantity = newQuantity;
      } else {
        // Reducing long position
        existing.quantity -= intent.quantity;
        if (existing.quantity < 0) {
          existing.averagePrice = fill.fillPrice;
        }
      }
    }

    existing.lastPrice = fill.fillPrice;
    existing.value = existing.quantity * existing.lastPrice;
    existing.pnl =
      (existing.lastPrice - existing.averagePrice) * existing.quantity;

    // Remove flat positions
    if (existing.quantity === 0) {
      this.positions.delete(key);
    }
  }
}

// ---------------------------------------------------------------------------
// ShadowBrokerAdapter — Read-only, records intents but never places orders
// ---------------------------------------------------------------------------

export class ShadowBrokerAdapter implements BrokerAdapter {
  readonly name = "shadow";
  readonly environment = "SHADOW_LIVE" as const;

  /** The real Kite adapter used for read-only market data and position reads. */
  private kiteAdapter: KiteBrokerAdapter;
  /** Recorded shadow intents — what WOULD have been traded. */
  private shadowIntents: ShadowOrderIntent[] = [];
  private latestTicks: Map<string, Tick> = new Map();
  private tickCallbacks: Map<string, (ticks: Tick[]) => void> = new Map();

  constructor(accessToken: string, apiKey: string) {
    this.kiteAdapter = new KiteBrokerAdapter(accessToken, apiKey);
  }

  /**
   * Shadow adapter NEVER places real orders. Instead, it records the intent
   * as a shadow order for later analysis and opportunity cost measurement.
   */
  async placeOrder(intent: OrderIntent): Promise<OrderResult> {
    const intentId = intent.id ?? generateId();
    const tick = this.latestTicks.get(
      `${intent.exchange}:${intent.symbol}`,
    );

    // Record the shadow intent
    const shadowIntent: ShadowOrderIntent = {
      id: `shadow-${generateId()}`,
      deploymentId: intent.deploymentId,
      signal: {
        id: intent.signalId ?? generateId(),
        deploymentId: intent.deploymentId,
        strategyVersionId: "",
        symbol: intent.symbol,
        exchange: intent.exchange,
        action: intent.transactionType === "BUY" ? "BUY" : "SELL",
        strength: 1,
        suggestedQuantity: intent.quantity,
        targetPrice: intent.price,
        timestamp: intent.signalTimestamp ?? new Date(),
      },
      intent,
      recordedAt: new Date(),
      marketSnapshot: {
        symbol: intent.symbol,
        lastPrice: tick?.lastPrice ?? intent.price ?? 0,
        bidPrice: tick?.buyDepth?.[0]?.price ?? tick?.lastPrice ?? 0,
        askPrice: tick?.sellDepth?.[0]?.price ?? tick?.lastPrice ?? 0,
        timestamp: tick?.timestamp ?? new Date(),
      },
    };

    this.shadowIntents.push(shadowIntent);

    return {
      intentId,
      status: "FILLED",
      brokerOrderId: `SHADOW-${shadowIntent.id}`,
      message:
        "Shadow intent recorded (no real order placed). " +
        `Market price: ${shadowIntent.marketSnapshot.lastPrice}`,
      timestamp: new Date(),
    };
  }

  /**
   * Cancel is a no-op for shadow — no real orders exist.
   */
  async cancelOrder(
    _brokerOrderId: string,
  ): Promise<{ success: boolean; message?: string }> {
    return {
      success: true,
      message: "Shadow mode: no real order to cancel",
    };
  }

  /**
   * Read real positions from the broker (read-only access to live state).
   */
  async getPositions(): Promise<Position[]> {
    return this.kiteAdapter.getPositions();
  }

  /**
   * Read real orders from the broker (read-only).
   */
  async getOrders(): Promise<BrokerOrderStatus[]> {
    return this.kiteAdapter.getOrders();
  }

  /**
   * Read real holdings from the broker (read-only).
   */
  async getHoldings(): Promise<Holding[]> {
    return this.kiteAdapter.getHoldings();
  }

  /**
   * Subscribe to LIVE tick data through the real Kite WebSocket.
   * Shadow-live uses real market data for signal computation.
   */
  streamTicks(
    instrumentTokens: number[],
    onTick: (ticks: Tick[]) => void,
  ): () => void {
    const id = generateId();

    // Wrap the callback to also update internal tick state
    const wrappedCallback = (ticks: Tick[]) => {
      for (const tick of ticks) {
        this.latestTicks.set(
          `${tick.exchange}:${tick.tradingSymbol}`,
          tick,
        );
      }
      onTick(ticks);
    };

    this.tickCallbacks.set(id, wrappedCallback);
    const kiteUnsub = this.kiteAdapter.streamTicks(
      instrumentTokens,
      wrappedCallback,
    );

    return () => {
      this.tickCallbacks.delete(id);
      kiteUnsub();
    };
  }

  /** Get all recorded shadow intents. */
  getShadowIntents(): ShadowOrderIntent[] {
    return [...this.shadowIntents];
  }

  /** Get shadow intents for a specific deployment. */
  getShadowIntentsForDeployment(
    deploymentId: string,
  ): ShadowOrderIntent[] {
    return this.shadowIntents.filter(
      (si) => si.deploymentId === deploymentId,
    );
  }

  /** Get the latest tick for a symbol. */
  getLatestTick(exchange: string, symbol: string): Tick | undefined {
    return this.latestTicks.get(`${exchange}:${symbol}`);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export type BrokerAdapterType = "kite" | "paper" | "shadow";

export interface BrokerAdapterFactoryConfig {
  type: BrokerAdapterType;
  /** Required for kite and shadow adapters. */
  accessToken?: string;
  /** Required for kite and shadow adapters. */
  apiKey?: string;
  /** Paper broker configuration. */
  paperConfig?: Partial<PaperBrokerConfig>;
}

/**
 * Create a broker adapter based on the deployment environment.
 * This is the single entry point for adapter creation, ensuring
 * the correct adapter is used for each environment.
 */
export function createBrokerAdapter(
  config: BrokerAdapterFactoryConfig,
): BrokerAdapter {
  switch (config.type) {
    case "kite": {
      if (!config.accessToken || !config.apiKey) {
        throw new Error(
          "KiteBrokerAdapter requires accessToken and apiKey",
        );
      }
      return new KiteBrokerAdapter(config.accessToken, config.apiKey);
    }
    case "paper": {
      return new PaperBrokerAdapter(config.paperConfig);
    }
    case "shadow": {
      if (!config.accessToken || !config.apiKey) {
        throw new Error(
          "ShadowBrokerAdapter requires accessToken and apiKey",
        );
      }
      return new ShadowBrokerAdapter(config.accessToken, config.apiKey);
    }
    default:
      throw new Error(`Unknown broker adapter type: ${config.type}`);
  }
}
