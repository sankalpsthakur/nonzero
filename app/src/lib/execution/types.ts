// ---------------------------------------------------------------------------
// Execution Layer – Type Definitions
// ---------------------------------------------------------------------------
// Shared types for the paper trading, shadow-live, and live execution engine.
// These types are consumed by broker adapters, the order engine, paper ledger,
// shadow-live engine, and risk engine.
// ---------------------------------------------------------------------------

import type {
  DeploymentEnvironment,
  DeploymentStatus,
  DivergenceSeverity,
  OrderIntentStatus,
  OrderType as PrismaOrderType,
  ProductType as PrismaProductType,
  RiskPolicyType,
  TransactionType,
} from "@prisma/client";

// ---------------------------------------------------------------------------
// Re-exports from Prisma
// ---------------------------------------------------------------------------

export type {
  DeploymentEnvironment,
  DeploymentStatus,
  DivergenceSeverity,
  OrderIntentStatus,
  RiskPolicyType,
  TransactionType,
};

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

export interface DateRange {
  from: Date;
  to: Date;
}

// ---------------------------------------------------------------------------
// Market data
// ---------------------------------------------------------------------------

/** A single tick / quote from the market data feed. */
export interface Tick {
  instrumentToken: number;
  tradingSymbol: string;
  exchange: string;
  lastPrice: number;
  lastQuantity: number;
  buyDepth: DepthLevel[];
  sellDepth: DepthLevel[];
  timestamp: Date;
  volume: number;
  ohlc: { open: number; high: number; low: number; close: number };
}

export interface DepthLevel {
  price: number;
  quantity: number;
  orders: number;
}

/** A snapshot of market state at a point in time. */
export interface MarketSnapshot {
  timestamp: Date;
  ticks: Map<string, Tick>;
  /** NIFTY 50 index value at snapshot time, if available. */
  niftyValue?: number;
}

// ---------------------------------------------------------------------------
// Positions & Holdings
// ---------------------------------------------------------------------------

export interface Position {
  symbol: string;
  exchange: string;
  quantity: number;
  averagePrice: number;
  lastPrice: number;
  pnl: number;
  product: PrismaProductType;
  /** Net value = quantity * lastPrice. */
  value: number;
}

export interface Holding {
  symbol: string;
  exchange: string;
  quantity: number;
  averagePrice: number;
  lastPrice: number;
  pnl: number;
  /** ISIN for the instrument. */
  isin?: string;
}

// ---------------------------------------------------------------------------
// Order types
// ---------------------------------------------------------------------------

/** An intent to place an order — the input to the execution engine. */
export interface OrderIntent {
  /** Internal ID (set by the engine). */
  id?: string;
  deploymentId: string;
  workspaceId: string;
  symbol: string;
  exchange: "NSE" | "BSE" | "NFO" | "CDS" | "BFO" | "MCX" | "BCD";
  transactionType: TransactionType;
  orderType: PrismaOrderType;
  quantity: number;
  price?: number;
  triggerPrice?: number;
  product: PrismaProductType;
  /** Optional tag for broker-side tracking (max 20 chars). */
  tag?: string;
  /** Strategy signal that generated this intent. */
  signalId?: string;
  /** Timestamp when the signal was generated. */
  signalTimestamp?: Date;
}

/** Result of submitting an order intent through the execution engine. */
export interface OrderResult {
  intentId: string;
  status: OrderIntentStatus;
  brokerOrderId?: string;
  message?: string;
  /** Timestamp of the result. */
  timestamp: Date;
  /** Validation errors, if the order was rejected pre-trade. */
  validationErrors?: string[];
}

/** The status of a broker order as returned by the broker API. */
export interface BrokerOrderStatus {
  brokerOrderId: string;
  status: string;
  filledQuantity: number;
  pendingQuantity: number;
  averagePrice: number;
  statusMessage?: string;
  exchangeTimestamp?: Date;
}

/** A broker order record combining intent and broker state. */
export interface BrokerOrder {
  id: string;
  orderIntentId: string;
  brokerOrderId: string;
  status: string;
  filledQuantity: number;
  averagePrice: number;
  statusMessage?: string;
  placedAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Trade log
// ---------------------------------------------------------------------------

/** A single trade entry for reconciliation and divergence computation. */
export interface TradeEntry {
  symbol: string;
  exchange: string;
  transactionType: TransactionType;
  quantity: number;
  price: number;
  timestamp: Date;
  brokerOrderId?: string;
  fees: number;
}

/** A sequence of trades over a time window. */
export interface TradeLog {
  deploymentId: string;
  entries: TradeEntry[];
  period: DateRange;
}

// ---------------------------------------------------------------------------
// Paper trading types
// ---------------------------------------------------------------------------

/** A simulated fill produced by the paper broker adapter. */
export interface PaperFill {
  intentId: string;
  symbol: string;
  exchange: string;
  transactionType: TransactionType;
  quantity: number;
  /** The simulated fill price (market price + slippage). */
  fillPrice: number;
  /** The market price at the time of the fill. */
  marketPrice: number;
  /** Slippage applied (positive = unfavourable). */
  slippage: number;
  /** Simulated brokerage + exchange fees. */
  fees: number;
  timestamp: Date;
  /** Whether the order was simulated as rejected. */
  rejected: boolean;
  rejectionReason?: string;
}

/** A recorded paper trade (fill that has been persisted). */
export interface PaperTrade {
  id: string;
  deploymentId: string;
  symbol: string;
  exchange: string;
  transactionType: TransactionType;
  quantity: number;
  price: number;
  fees: number;
  pnl?: number;
  timestamp: Date;
}

/** A paper position derived from the paper ledger. */
export interface PaperPosition {
  symbol: string;
  exchange: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  /** Total value at current market price. */
  value: number;
}

/** Summary of profit and loss for a period. */
export interface PnLSummary {
  period: DateRange;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  totalFees: number;
  /** Gross profit (sum of winning trades). */
  grossProfit: number;
  /** Gross loss (sum of losing trades). */
  grossLoss: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  profitFactor: number;
}

/** A point on the equity curve. */
export interface EquityPoint {
  timestamp: Date;
  equity: number;
  /** Drawdown from the peak at this point (0 to 1). */
  drawdown: number;
  /** Cumulative P&L at this point. */
  cumulativePnl: number;
}

// ---------------------------------------------------------------------------
// Shadow-live types
// ---------------------------------------------------------------------------

/** A shadow order intent — what WOULD have been traded. */
export interface ShadowOrderIntent {
  id: string;
  deploymentId: string;
  signal: Signal;
  /** The order intent that the strategy would have generated. */
  intent: OrderIntent;
  /** Timestamp when the shadow intent was recorded. */
  recordedAt: Date;
  /** Market snapshot at the time of the signal. */
  marketSnapshot: {
    symbol: string;
    lastPrice: number;
    bidPrice: number;
    askPrice: number;
    timestamp: Date;
  };
}

/** A hypothetical fill for a shadow intent. */
export interface HypotheticalFill {
  shadowIntentId: string;
  /** Estimated fill price based on market data at signal time. */
  estimatedFillPrice: number;
  /** Estimated slippage based on order book depth. */
  estimatedSlippage: number;
  /** Estimated fees. */
  estimatedFees: number;
  /** Estimated P&L if this trade had been executed. */
  estimatedPnl?: number;
  /** Confidence in the fill estimate (0-1). */
  fillConfidence: number;
  timestamp: Date;
}

/** Opportunity cost of NOT executing a shadow intent. */
export interface OpportunityCost {
  shadowIntentId: string;
  /** The hypothetical P&L from the shadow trade. */
  hypotheticalPnl: number;
  /** The actual P&L from the real broker order, if one exists. */
  actualPnl?: number;
  /** The delta: missed alpha = hypothetical - actual. */
  missedAlpha: number;
  /** Time delta between shadow signal and actual execution (ms). */
  executionDelay?: number;
  /** Price delta between shadow fill and actual fill. */
  priceDelta?: number;
}

// ---------------------------------------------------------------------------
// Signal types
// ---------------------------------------------------------------------------

/** A trading signal emitted by a strategy. */
export interface Signal {
  id: string;
  deploymentId: string;
  strategyVersionId: string;
  symbol: string;
  exchange: string;
  action: "BUY" | "SELL" | "HOLD";
  /** Signal strength / confidence (0 to 1). */
  strength: number;
  /** Suggested order size. */
  suggestedQuantity: number;
  /** Target price for limit orders. */
  targetPrice?: number;
  /** Stop loss price. */
  stopLoss?: number;
  /** Metadata from the strategy computation. */
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

/** A strategy deployment with its configuration. */
export interface DeployedStrategy {
  deploymentId: string;
  strategyVersionId: string;
  familyId: string;
  workspaceId: string;
  environment: DeploymentEnvironment;
  status: DeploymentStatus;
  /** Capital allocated to this deployment. */
  capitalAllocated: number;
  /** The strategy code snapshot. */
  codeSnapshot: string;
  /** Strategy configuration parameters. */
  config: Record<string, unknown>;
  /** The symbols this strategy trades. */
  universe: string[];
}

// ---------------------------------------------------------------------------
// Risk types
// ---------------------------------------------------------------------------

/** A risk policy from the database, enriched for runtime use. */
export interface RiskPolicy {
  id: string;
  workspaceId: string;
  name: string;
  type: RiskPolicyType;
  /** The threshold value for this policy. */
  threshold: number;
  isActive: boolean;
}

/** Result of a single risk check. */
export interface RiskCheckResult {
  policyId: string;
  policyName: string;
  policyType: RiskPolicyType;
  passed: boolean;
  /** Current value being checked. */
  currentValue: number;
  /** The threshold that must not be exceeded. */
  threshold: number;
  message: string;
}

/** Aggregate result of pre-trade risk checks. */
export interface RiskCheck {
  passed: boolean;
  checks: RiskCheckResult[];
  /** If not passed, the reasons for rejection. */
  rejectionReasons: string[];
  timestamp: Date;
}

/** Portfolio-level risk check result. */
export interface PortfolioRiskCheck {
  passed: boolean;
  checks: RiskCheckResult[];
  totalExposure: number;
  /** Exposure by symbol. */
  exposureBySymbol: Map<string, number>;
  /** Daily P&L at check time. */
  dailyPnl: number;
  timestamp: Date;
}

/** Result of triggering the emergency kill switch. */
export interface KillSwitchResult {
  workspaceId: string;
  /** Number of deployments paused. */
  deploymentsPaused: number;
  /** Number of pending orders cancelled. */
  ordersCancelled: number;
  /** Any errors that occurred during the kill switch. */
  errors: string[];
  triggeredAt: Date;
  success: boolean;
}

/** Exposure information for a workspace or symbol. */
export interface ExposureInfo {
  workspaceId: string;
  /** Total portfolio exposure (sum of abs position values). */
  totalExposure: number;
  /** Net exposure (long - short). */
  netExposure: number;
  /** Gross exposure (long + short). */
  grossExposure: number;
  /** Exposure broken down by symbol. */
  bySymbol: Array<{
    symbol: string;
    exchange: string;
    quantity: number;
    value: number;
    weight: number;
  }>;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Divergence & Reconciliation
// ---------------------------------------------------------------------------

/** Reconciliation result comparing expected vs actual positions. */
export interface ReconciliationResult {
  timestamp: Date;
  matched: Array<{
    symbol: string;
    expectedQuantity: number;
    actualQuantity: number;
  }>;
  mismatched: Array<{
    symbol: string;
    expectedQuantity: number;
    actualQuantity: number;
    quantityDelta: number;
    priceDelta?: number;
  }>;
  /** Positions in expected but missing from actual. */
  missing: Array<{
    symbol: string;
    expectedQuantity: number;
  }>;
  /** Positions in actual but not in expected (unexpected). */
  unexpected: Array<{
    symbol: string;
    actualQuantity: number;
  }>;
  /** Overall reconciliation passed (no mismatches). */
  reconciled: boolean;
}

/** A divergence report comparing expected vs actual trade execution. */
export interface DivergenceReport {
  deploymentId: string;
  workspaceId: string;
  /** Delta in entry timing (ms). Null if no comparable entry. */
  entryTimeDelta: number | null;
  /** Delta in execution price. */
  priceDelta: number | null;
  /** Delta in fill rate (0-1). */
  fillRateDelta: number | null;
  /** Delta in position size. */
  positionDelta: number | null;
  /** Delta in P&L. */
  pnlDelta: number | null;
  /** Composite divergence score (0 = identical, higher = more divergent). */
  divergenceScore: number;
  /** Severity classification. */
  severity: DivergenceSeverity;
  timestamp: Date;
}

/** Aggregated divergence metrics for a deployment. */
export interface DivergenceMetrics {
  deploymentId: string;
  /** Number of divergence reports in the window. */
  reportCount: number;
  /** Average divergence score. */
  averageDivergenceScore: number;
  /** Maximum divergence score observed. */
  maxDivergenceScore: number;
  /** Average entry time delta (ms). */
  averageEntryTimeDelta: number;
  /** Average price delta. */
  averagePriceDelta: number;
  /** Cumulative P&L delta. */
  cumulativePnlDelta: number;
  /** Trend: is divergence increasing, stable, or decreasing? */
  trend: "increasing" | "stable" | "decreasing";
  /** Most recent severity. */
  currentSeverity: DivergenceSeverity;
  period: DateRange;
}

// ---------------------------------------------------------------------------
// Broker adapter interface
// ---------------------------------------------------------------------------

/**
 * Broker adapter interface — the abstraction that makes paper, shadow-live,
 * and live trading use the SAME execution code path.
 *
 * "If testing and live use different execution logic, the system lies to itself."
 */
export interface BrokerAdapter {
  readonly name: string;
  readonly environment: DeploymentEnvironment;

  /** Place an order through the broker. */
  placeOrder(intent: OrderIntent): Promise<OrderResult>;

  /** Cancel a pending order. */
  cancelOrder(brokerOrderId: string): Promise<{ success: boolean; message?: string }>;

  /** Get current positions from the broker. */
  getPositions(): Promise<Position[]>;

  /** Get all orders for the current session. */
  getOrders(): Promise<BrokerOrderStatus[]>;

  /** Get holdings (delivery positions). */
  getHoldings(): Promise<Holding[]>;

  /**
   * Subscribe to live tick data for the given instrument tokens.
   * Returns an unsubscribe function.
   */
  streamTicks(
    instrumentTokens: number[],
    onTick: (ticks: Tick[]) => void,
  ): () => void;
}
