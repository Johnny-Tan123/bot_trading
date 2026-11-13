import { Signal } from './strategy';

export type PositionType = 'LONG' | 'SHORT';
export type ExitReason = 'TP' | 'SL' | 'SIGNAL' | 'END_OF_DATA';

export interface Trade {
  id: string;
  type: PositionType;
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  feePaid: number;
  exitReason: ExitReason;
  durationSeconds: number;
  // ICT specific price levels
  stopLossPrice?: number;
  takeProfitPrice?: number;
  sweepTime?: number;
  sweepPrice?: number;
  mssPrice?: number;
}

export interface EquityPoint {
  time: number;
  equity: number;
  drawdownPercent: number;
  benchmarkEquity: number; // Buy & Hold
}

export interface BacktestMetrics {
  initialCapital: number;
  finalEquity: number;
  netProfit: number;
  netProfitPercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number; // percentage 0 - 100
  profitFactor: number;
  maxDrawdownPercent: number;
  maxDrawdownDollar: number;
  sharpeRatio: number;
  avgTradePercent: number;
  buyAndHoldReturnPercent: number;
}

export interface BacktestConfig {
  initialCapital: number;
  feePercent: number; // e.g. 0.05 = 0.05%
  slippagePercent: number; // e.g. 0.01 = 0.01%
  takeProfitPercent?: number; // optional fixed TP %
  stopLossPercent?: number; // optional fixed SL %
}

export interface BacktestResult {
  config: BacktestConfig;
  metrics: BacktestMetrics;
  trades: Trade[];
  equityCurve: EquityPoint[];
  signals: Signal[];
}
