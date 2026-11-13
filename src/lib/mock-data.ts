import { Candle } from '@/types/market';

/**
 * Generates realistic synthetic candlestick data using geometric random walk with volatility clustering
 */
export function generateMockCandles(
  count: number = 500,
  startPrice: number = 65000,
  intervalSeconds: number = 3600 // 1 hour default
): Candle[] {
  const candles: Candle[] = [];
  const now = Math.floor(Date.now() / 1000);
  let currentTime = now - count * intervalSeconds;
  let currentPrice = startPrice;

  let trend = 0.0002; // slight upward drift

  for (let i = 0; i < count; i++) {
    // Random walk with periodic trend shift
    if (i % 80 === 0) {
      trend = (Math.random() - 0.48) * 0.0015;
    }

    const volatility = 0.012 + Math.random() * 0.008;
    const changePercent = trend + (Math.random() - 0.5) * volatility;
    const open = currentPrice;
    const close = Math.max(100, open * (1 + changePercent));

    const wickUp = Math.random() * 0.008 * Math.max(open, close);
    const wickDown = Math.random() * 0.008 * Math.min(open, close);
    const high = Math.max(open, close) + wickUp;
    const low = Math.min(open, close) - wickDown;

    const baseVolume = 100 + Math.random() * 400;
    const volume = Math.round(baseVolume * (1 + Math.abs(changePercent) * 20));

    candles.push({
      time: currentTime,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume,
    });

    currentPrice = close;
    currentTime += intervalSeconds;
  }

  return candles;
}
