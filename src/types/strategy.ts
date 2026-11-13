import { Candle } from './market';

export type SignalType = 'BUY' | 'SELL' | 'CLOSE';

export interface Signal {
  time: number; // Unix timestamp in seconds
  type: SignalType;
  price: number;
  stopLoss?: number;   // Exact price level for SL (e.g. ICT sweep wick)
  takeProfit?: number; // Exact price level for TP (e.g. R:R target)
  reason?: string;
  // ICT Structure Context for charting:
  sweepTime?: number;
  sweepPrice?: number;
  mssTime?: number;
  mssPrice?: number;
}

export type ParamType = 'number' | 'boolean' | 'select';

export interface ParamDefinition {
  key: string;
  label: string;
  type: ParamType;
  defaultValue: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: string | number }[];
}

export interface Strategy<T = Record<string, unknown>> {
  id: string;
  name: string;
  description: string;
  paramDefinitions: ParamDefinition[];
  defaultParams: T;
  execute: (candles: Candle[], params: T) => Signal[];
}
