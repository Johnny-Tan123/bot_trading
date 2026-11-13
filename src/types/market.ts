export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export interface Candle {
  time: number; // Unix timestamp in seconds (Lightweight Charts uses seconds)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketSymbol {
  symbol: string;
  name: string;
  baseAsset: string;
  quoteAsset: string;
}
