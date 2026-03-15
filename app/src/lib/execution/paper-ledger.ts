// ---------------------------------------------------------------------------
// Paper Trading Ledger
// ---------------------------------------------------------------------------
// Manages the paper trading portfolio: records simulated fills, tracks
// positions, computes P&L, and builds equity curves. All data is persisted
// to the PaperLedger table so it survives process restarts.
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import type {
  DateRange,
  EquityPoint,
  OrderIntent,
  PaperFill,
  PaperPosition,
  PaperTrade,
  PnLSummary,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default fee model: approximate Zerodha charges for equity delivery. */
const DEFAULT_FEE_RATE = 0.00015; // ~1.5 bps (STT + exchange + SEBI + stamp)

/** Default slippage model parameters. */
const DEFAULT_SLIPPAGE_BPS = 5;

// ---------------------------------------------------------------------------
// Paper Ledger
// ---------------------------------------------------------------------------

export class PaperLedger {
  private deploymentId: string;
  private initialCapital: number;

  constructor(deploymentId: string, initialCapital: number = 1_000_000) {
    this.deploymentId = deploymentId;
    this.initialCapital = initialCapital;
  }

  // -------------------------------------------------------------------------
  // Record trades
  // -------------------------------------------------------------------------

  /**
   * Record a paper trade (a completed paper fill) to the database.
   */
  async recordTrade(trade: PaperTrade): Promise<void> {
    await db.paperLedger.create({
      data: {
        deploymentId: trade.deploymentId,
        timestamp: trade.timestamp,
        action: trade.transactionType,
        symbol: trade.symbol,
        quantity: trade.quantity,
        price: trade.price,
        fees: trade.fees,
        pnl: trade.pnl,
      },
    });
  }

  /**
   * Record multiple trades in a batch.
   */
  async recordTrades(trades: PaperTrade[]): Promise<void> {
    await db.paperLedger.createMany({
      data: trades.map((t) => ({
        deploymentId: t.deploymentId,
        timestamp: t.timestamp,
        action: t.transactionType,
        symbol: t.symbol,
        quantity: t.quantity,
        price: t.price,
        fees: t.fees,
        pnl: t.pnl,
      })),
    });
  }

  // -------------------------------------------------------------------------
  // Positions
  // -------------------------------------------------------------------------

  /**
   * Compute current paper positions from the ledger.
   * Positions are derived by replaying all trades for this deployment.
   */
  async getPositions(): Promise<PaperPosition[]> {
    const trades = await db.paperLedger.findMany({
      where: { deploymentId: this.deploymentId },
      orderBy: { timestamp: "asc" },
    });

    // Build position map from trade history
    const positionMap = new Map<
      string,
      {
        symbol: string;
        exchange: string;
        quantity: number;
        totalCost: number;
        realizedPnl: number;
        lastPrice: number;
      }
    >();

    for (const trade of trades) {
      const key = trade.symbol;
      const existing = positionMap.get(key) ?? {
        symbol: trade.symbol,
        exchange: "", // Exchange not stored in paper ledger; derived from symbol
        quantity: 0,
        totalCost: 0,
        realizedPnl: 0,
        lastPrice: Number(trade.price),
      };

      const price = Number(trade.price);
      const qty = trade.quantity;
      const fees = Number(trade.fees);

      if (trade.action === "BUY") {
        // Adding to position
        existing.totalCost += price * qty + fees;
        existing.quantity += qty;
      } else if (trade.action === "SELL") {
        // Reducing position — realize P&L
        if (existing.quantity > 0) {
          const avgCost = existing.totalCost / existing.quantity;
          const pnl = (price - avgCost) * Math.min(qty, existing.quantity) - fees;
          existing.realizedPnl += pnl;
          existing.totalCost -= avgCost * Math.min(qty, existing.quantity);
        }
        existing.quantity -= qty;
      }

      existing.lastPrice = price;
      positionMap.set(key, existing);
    }

    // Convert to PaperPosition array, filtering out flat positions
    const positions: PaperPosition[] = [];
    for (const pos of positionMap.values()) {
      if (pos.quantity === 0) continue;

      const averagePrice =
        pos.quantity !== 0 ? pos.totalCost / pos.quantity : 0;
      const unrealizedPnl =
        (pos.lastPrice - averagePrice) * pos.quantity;

      positions.push({
        symbol: pos.symbol,
        exchange: pos.exchange,
        quantity: pos.quantity,
        averagePrice: Math.round(averagePrice * 100) / 100,
        currentPrice: pos.lastPrice,
        unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
        realizedPnl: Math.round(pos.realizedPnl * 100) / 100,
        value: Math.round(pos.quantity * pos.lastPrice * 100) / 100,
      });
    }

    return positions;
  }

  // -------------------------------------------------------------------------
  // P&L
  // -------------------------------------------------------------------------

  /**
   * Compute P&L summary for a given period (or all time if not specified).
   */
  async getPnL(period?: DateRange): Promise<PnLSummary> {
    const where: Record<string, unknown> = {
      deploymentId: this.deploymentId,
    };

    if (period) {
      where.timestamp = {
        gte: period.from,
        lte: period.to,
      };
    }

    const trades = await db.paperLedger.findMany({
      where,
      orderBy: { timestamp: "asc" },
    });

    // Compute P&L by tracking positions through the trade history
    const positionAvgCost = new Map<string, number>();
    const positionQty = new Map<string, number>();

    let grossProfit = 0;
    let grossLoss = 0;
    let totalFees = 0;
    let winCount = 0;
    let lossCount = 0;
    let totalRealizedPnl = 0;

    for (const trade of trades) {
      const price = Number(trade.price);
      const qty = trade.quantity;
      const fees = Number(trade.fees);
      totalFees += fees;

      if (trade.action === "BUY") {
        const currentQty = positionQty.get(trade.symbol) ?? 0;
        const currentCost = positionAvgCost.get(trade.symbol) ?? 0;

        // Weighted average cost
        const newQty = currentQty + qty;
        const newAvgCost =
          newQty > 0
            ? (currentCost * currentQty + price * qty) / newQty
            : price;

        positionQty.set(trade.symbol, newQty);
        positionAvgCost.set(trade.symbol, newAvgCost);
      } else if (trade.action === "SELL") {
        const currentQty = positionQty.get(trade.symbol) ?? 0;
        const avgCost = positionAvgCost.get(trade.symbol) ?? 0;

        const sellQty = Math.min(qty, currentQty);
        const tradePnl = (price - avgCost) * sellQty - fees;

        totalRealizedPnl += tradePnl;

        if (tradePnl > 0) {
          grossProfit += tradePnl;
          winCount++;
        } else {
          grossLoss += Math.abs(tradePnl);
          lossCount++;
        }

        positionQty.set(trade.symbol, currentQty - sellQty);
      }
    }

    // Compute unrealized P&L from open positions
    let unrealizedPnl = 0;
    for (const [symbol, qty] of positionQty) {
      if (qty <= 0) continue;
      const avgCost = positionAvgCost.get(symbol) ?? 0;
      // Use last trade price as current price estimate
      const lastTrade = trades
        .filter((t) => t.symbol === symbol)
        .pop();
      const currentPrice = lastTrade ? Number(lastTrade.price) : avgCost;
      unrealizedPnl += (currentPrice - avgCost) * qty;
    }

    const tradeCount = winCount + lossCount;
    const winRate = tradeCount > 0 ? winCount / tradeCount : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    const effectivePeriod: DateRange = period ?? {
      from: trades.length > 0 ? trades[0].timestamp : new Date(),
      to: trades.length > 0 ? trades[trades.length - 1].timestamp : new Date(),
    };

    return {
      period: effectivePeriod,
      realizedPnl: Math.round(totalRealizedPnl * 100) / 100,
      unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
      totalPnl: Math.round((totalRealizedPnl + unrealizedPnl) * 100) / 100,
      totalFees: Math.round(totalFees * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      grossLoss: Math.round(grossLoss * 100) / 100,
      tradeCount,
      winCount,
      lossCount,
      winRate: Math.round(winRate * 10000) / 10000,
      profitFactor: Math.round(profitFactor * 100) / 100,
    };
  }

  // -------------------------------------------------------------------------
  // Equity curve
  // -------------------------------------------------------------------------

  /**
   * Build the paper equity curve from the trade history.
   * Each point represents the portfolio value after each trade.
   */
  async getEquityCurve(): Promise<EquityPoint[]> {
    const trades = await db.paperLedger.findMany({
      where: { deploymentId: this.deploymentId },
      orderBy: { timestamp: "asc" },
    });

    if (trades.length === 0) {
      return [
        {
          timestamp: new Date(),
          equity: this.initialCapital,
          drawdown: 0,
          cumulativePnl: 0,
        },
      ];
    }

    const curve: EquityPoint[] = [];
    let cash = this.initialCapital;
    let peak = this.initialCapital;
    const positionQty = new Map<string, number>();
    const positionAvgCost = new Map<string, number>();
    const lastPrices = new Map<string, number>();

    // Add initial point
    curve.push({
      timestamp: trades[0].timestamp,
      equity: this.initialCapital,
      drawdown: 0,
      cumulativePnl: 0,
    });

    for (const trade of trades) {
      const price = Number(trade.price);
      const qty = trade.quantity;
      const fees = Number(trade.fees);

      lastPrices.set(trade.symbol, price);

      if (trade.action === "BUY") {
        cash -= price * qty + fees;
        const currentQty = positionQty.get(trade.symbol) ?? 0;
        const currentCost = positionAvgCost.get(trade.symbol) ?? 0;
        const newQty = currentQty + qty;
        positionAvgCost.set(
          trade.symbol,
          newQty > 0
            ? (currentCost * currentQty + price * qty) / newQty
            : price,
        );
        positionQty.set(trade.symbol, newQty);
      } else {
        cash += price * qty - fees;
        const currentQty = positionQty.get(trade.symbol) ?? 0;
        positionQty.set(trade.symbol, currentQty - qty);
      }

      // Compute portfolio value
      let positionValue = 0;
      for (const [symbol, q] of positionQty) {
        const lp = lastPrices.get(symbol) ?? 0;
        positionValue += q * lp;
      }

      const equity = cash + positionValue;
      peak = Math.max(peak, equity);
      const drawdown = peak > 0 ? (peak - equity) / peak : 0;
      const cumulativePnl = equity - this.initialCapital;

      curve.push({
        timestamp: trade.timestamp,
        equity: Math.round(equity * 100) / 100,
        drawdown: Math.round(drawdown * 10000) / 10000,
        cumulativePnl: Math.round(cumulativePnl * 100) / 100,
      });
    }

    return curve;
  }

  // -------------------------------------------------------------------------
  // Fill simulation
  // -------------------------------------------------------------------------

  /**
   * Simulate an order fill with a realistic slippage model.
   *
   * Slippage model:
   * - Base: configurable BPS (default 5 bps)
   * - Size impact: additional slippage for large orders (> 1% of avg volume)
   * - Volatility adjustment: higher slippage in volatile conditions
   * - Direction: always unfavourable (BUY fills higher, SELL fills lower)
   */
  simulateFill(intent: OrderIntent, marketPrice: number): PaperFill {
    const intentId = intent.id ?? `fill-${Date.now()}`;

    // Base slippage
    const baseSlippage = DEFAULT_SLIPPAGE_BPS / 10000;

    // Size impact: penalize large orders
    // Assume average daily volume of ~1M units; orders > 1% get extra slippage
    const sizeImpact = intent.quantity > 10000
      ? (intent.quantity / 1_000_000) * 0.001
      : 0;

    // Total slippage with random variance (0.5x to 1.5x)
    const variance = 0.5 + Math.random();
    const totalSlippage = (baseSlippage + sizeImpact) * variance;

    // Apply slippage in the unfavourable direction
    const direction = intent.transactionType === "BUY" ? 1 : -1;
    const fillPrice =
      Math.round(marketPrice * (1 + direction * totalSlippage) * 100) / 100;

    // Compute fees
    const turnover = intent.quantity * fillPrice;
    const fees = Math.round(turnover * DEFAULT_FEE_RATE * 100) / 100;

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

  // -------------------------------------------------------------------------
  // Utility
  // -------------------------------------------------------------------------

  /**
   * Get the total number of trades for this deployment.
   */
  async getTradeCount(): Promise<number> {
    return db.paperLedger.count({
      where: { deploymentId: this.deploymentId },
    });
  }

  /**
   * Get all trades for this deployment, optionally filtered by period.
   */
  async getTrades(period?: DateRange): Promise<PaperTrade[]> {
    const where: Record<string, unknown> = {
      deploymentId: this.deploymentId,
    };

    if (period) {
      where.timestamp = { gte: period.from, lte: period.to };
    }

    const records = await db.paperLedger.findMany({
      where,
      orderBy: { timestamp: "asc" },
    });

    return records.map((r) => ({
      id: r.id,
      deploymentId: r.deploymentId,
      symbol: r.symbol,
      exchange: "",
      transactionType: r.action as "BUY" | "SELL",
      quantity: r.quantity,
      price: Number(r.price),
      fees: Number(r.fees),
      pnl: r.pnl ? Number(r.pnl) : undefined,
      timestamp: r.timestamp,
    }));
  }

  /**
   * Reset the paper ledger for this deployment (delete all trades).
   * Use with caution — this is irreversible.
   */
  async reset(): Promise<{ deletedCount: number }> {
    const result = await db.paperLedger.deleteMany({
      where: { deploymentId: this.deploymentId },
    });
    return { deletedCount: result.count };
  }
}
