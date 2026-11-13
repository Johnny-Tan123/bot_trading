import { Candle, Timeframe } from '@/types/market';
import { generateMockCandles } from './mock-data';

export interface MarketAsset {
  symbol: string;
  name: string;
  category: 'COMMODITY' | 'INDEX';
  source: 'BYBIT' | 'YAHOO' | 'BINANCE';
  ticker: string;
  defaultPrice: number;
}

export const SUPPORTED_PAIRS: MarketAsset[] = [
  {
    symbol: 'XAU',
    name: 'XAU/USD (Spot Gold Vàng)',
    category: 'COMMODITY',
    source: 'BYBIT',
    ticker: 'XAUUSDT',
    defaultPrice: 3986,
  },
  {
    symbol: 'US100',
    name: 'US100 (Nasdaq 100 Futures - NQ)',
    category: 'INDEX',
    source: 'YAHOO',
    ticker: 'NQ=F',
    defaultPrice: 28650,
  },
  {
    symbol: 'US500',
    name: 'US500 (S&P 500 Futures - ES)',
    category: 'INDEX',
    source: 'YAHOO',
    ticker: 'ES=F',
    defaultPrice: 7660,
  },
];

/**
 * Seconds per timeframe interval
 */
function getIntervalSeconds(interval: Timeframe): number {
  switch (interval) {
    case '15m':
      return 15 * 60;
    case '1h':
      return 60 * 60;
    case '4h':
      return 4 * 60 * 60;
    case '1d':
      return 24 * 60 * 60;
    default:
      return 60 * 60;
  }
}

/**
 * Fetch Spot Gold (XAU/USD) via Bybit Linear XAUUSDT (100% Spot Forex price sync with TradingView)
 * Zero delay, 24/7 liquidity, exact spot price matching TradingView XAUUSD (Exness / OANDA)
 */
async function fetchBybitSpotGold(
  interval: Timeframe = '1h',
  limit: number = 1000
): Promise<Candle[]> {
  let bybitInterval = '60';
  switch (interval) {
    case '15m':
      bybitInterval = '15';
      break;
    case '1h':
      bybitInterval = '60';
      break;
    case '4h':
      bybitInterval = '240';
      break;
    case '1d':
      bybitInterval = 'D';
      break;
    default:
      bybitInterval = '60';
  }

  const targetLimit = limit > 0 ? limit : 2000;
  const pageSize = 1000;
  const pagesNeeded = Math.min(10, Math.ceil(targetLimit / pageSize));

  let allBars: (string | number)[][] = [];
  let currentEndTime: number | undefined = undefined;

  for (let p = 0; p < pagesNeeded; p++) {
    const fetchLimit = Math.min(pageSize, targetLimit - allBars.length);
    let url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=XAUUSDT&interval=${bybitInterval}&limit=${fetchLimit}`;
    if (currentEndTime) {
      url += `&end=${currentEndTime}`;
    }

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) break;
    const json = await res.json();
    const list = json.result?.list;
    if (!list || !Array.isArray(list) || list.length === 0) break;

    // Bybit returns newest first
    allBars = [...allBars, ...list];
    const oldestInBatch = list[list.length - 1];
    currentEndTime = Number(oldestInBatch[0]) - 1;

    if (list.length < fetchLimit) break;
  }

  if (allBars.length === 0) {
    throw new Error('No candle data returned from Bybit XAUUSDT');
  }

  // Deduplicate and convert to seconds
  const candleMap = new Map<number, Candle>();
  for (const bar of allBars) {
    const timeSec = Math.floor(Number(bar[0]) / 1000);
    candleMap.set(timeSec, {
      time: timeSec,
      open: Math.round(parseFloat(bar[1] as string) * 100) / 100,
      high: Math.round(parseFloat(bar[2] as string) * 100) / 100,
      low: Math.round(parseFloat(bar[3] as string) * 100) / 100,
      close: Math.round(parseFloat(bar[4] as string) * 100) / 100,
      volume: Math.round(parseFloat(bar[5] as string) * 100) / 100,
    });
  }

  const sorted = Array.from(candleMap.values()).sort((a, b) => a.time - b.time);
  return targetLimit > 0 ? sorted.slice(-targetLimit) : sorted;
}

/**
 * Fetch Index Futures (US100 / US500) via Yahoo Finance with strict timestamp normalization
 * Snaps unrounded tick bars to standard interval boundaries and merges live ticks
 */
async function fetchYahooFutures(
  ticker: string,
  interval: Timeframe = '1h',
  limit: number = 1000
): Promise<Candle[]> {
  let yfInterval = '1h';
  let yfRange = '730d';
  const intervalSec = getIntervalSeconds(interval);

  switch (interval) {
    case '15m':
      yfInterval = '15m';
      yfRange = '60d';
      break;
    case '1h':
      yfInterval = '1h';
      yfRange = '730d';
      break;
    case '4h':
      yfInterval = '1h'; // Aggregate to 4h from 1h bars
      yfRange = '730d';
      break;
    case '1d':
      yfInterval = '1d';
      yfRange = '10y';
      break;
    default:
      yfInterval = '1h';
      yfRange = '730d';
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ticker
  )}?interval=${yfInterval}&range=${yfRange}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`Yahoo Finance API error: ${res.statusText}`);
  }

  const json = await res.json();
  const result = json.chart?.result?.[0];
  if (!result) {
    throw new Error('No chart data returned from Yahoo Finance');
  }

  const timestamps: number[] = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const opens: (number | null)[] = quote.open || [];
  const highs: (number | null)[] = quote.high || [];
  const lows: (number | null)[] = quote.low || [];
  const closes: (number | null)[] = quote.close || [];
  const volumes: (number | null)[] = quote.volume || [];

  const candleMap = new Map<number, Candle>();
  const snapSec = interval === '4h' ? 3600 : intervalSec;

  for (let i = 0; i < timestamps.length; i++) {
    const rawTime = timestamps[i];
    const open = opens[i];
    const high = highs[i];
    const low = lows[i];
    const close = closes[i];
    const volume = volumes[i] || 0;

    if (
      open == null ||
      high == null ||
      low == null ||
      close == null ||
      isNaN(open) ||
      isNaN(high) ||
      isNaN(low) ||
      isNaN(close)
    ) {
      continue;
    }

    let bucketTime = rawTime;
    if (interval !== '1d') {
      bucketTime = Math.floor(rawTime / snapSec) * snapSec;
    }

    if (candleMap.has(bucketTime)) {
      const existing = candleMap.get(bucketTime)!;
      existing.high = Math.max(existing.high, Math.round(high * 100) / 100);
      existing.low = Math.min(existing.low, Math.round(low * 100) / 100);
      existing.close = Math.round(close * 100) / 100;
      existing.volume += Math.round(volume);
    } else {
      candleMap.set(bucketTime, {
        time: bucketTime,
        open: Math.round(open * 100) / 100,
        high: Math.round(high * 100) / 100,
        low: Math.round(low * 100) / 100,
        close: Math.round(close * 100) / 100,
        volume: Math.round(volume),
      });
    }
  }

  let candles = Array.from(candleMap.values()).sort((a, b) => a.time - b.time);

  // If 4h requested, aggregate 1h candles into 4h intervals
  if (interval === '4h' && candles.length > 0) {
    const aggregated: Candle[] = [];
    for (let i = 0; i < candles.length; i += 4) {
      const slice = candles.slice(i, i + 4);
      if (slice.length === 0) continue;
      aggregated.push({
        time: slice[0].time,
        open: slice[0].open,
        high: Math.max(...slice.map((c) => c.high)),
        low: Math.min(...slice.map((c) => c.low)),
        close: slice[slice.length - 1].close,
        volume: slice.reduce((acc, c) => acc + c.volume, 0),
      });
    }
    candles = aggregated;
  }

  if (candles.length === 0) {
    throw new Error('Empty dataset after normalizing Yahoo Finance candles');
  }

  return limit > 0 ? candles.slice(-limit) : candles;
}

/**
 * Universal Market Kline Fetcher
 */
export async function fetchMarketKlines(
  symbol: string = 'XAU',
  interval: Timeframe = '1h',
  limit: number = 500
): Promise<Candle[]> {
  const asset = SUPPORTED_PAIRS.find((p) => p.symbol === symbol) || SUPPORTED_PAIRS[0];

  try {
    if (asset.symbol === 'XAU') {
      return await fetchBybitSpotGold(interval, limit);
    } else {
      return await fetchYahooFutures(asset.ticker, interval, limit);
    }
  } catch (error) {
    console.warn(`Failed to fetch real-time data for ${symbol}, falling back to alternative:`, error);
    // If Bybit failed for XAU, attempt Yahoo GC=F as fallback
    if (asset.symbol === 'XAU') {
      try {
        return await fetchYahooFutures('GC=F', interval, limit);
      } catch (yfErr) {
        console.warn('Yahoo fallback also failed:', yfErr);
      }
    }
    return generateMockCandles(limit > 0 ? limit : 500, asset.defaultPrice);
  }
}

/**
 * Fetch only the single latest candle and current live price
 * Used for live real-time ticking
 */
export async function fetchLatestCandle(
  symbol: string = 'XAU',
  interval: Timeframe = '1h'
): Promise<Candle | null> {
  const asset = SUPPORTED_PAIRS.find((p) => p.symbol === symbol) || SUPPORTED_PAIRS[0];

  try {
    if (asset.symbol === 'XAU') {
      let bybitInterval = '60';
      switch (interval) {
        case '15m':
          bybitInterval = '15';
          break;
        case '1h':
          bybitInterval = '60';
          break;
        case '4h':
          bybitInterval = '240';
          break;
        case '1d':
          bybitInterval = 'D';
          break;
      }

      const res = await fetch(
        `https://api.bybit.com/v5/market/kline?category=linear&symbol=XAUUSDT&interval=${bybitInterval}&limit=1`,
        { cache: 'no-store' }
      );
      if (!res.ok) return null;
      const json = await res.json();
      const list = json.result?.list;
      if (!list || !Array.isArray(list) || list.length === 0) return null;

      const bar = list[0];
      return {
        time: Math.floor(Number(bar[0]) / 1000),
        open: Math.round(parseFloat(bar[1] as string) * 100) / 100,
        high: Math.round(parseFloat(bar[2] as string) * 100) / 100,
        low: Math.round(parseFloat(bar[3] as string) * 100) / 100,
        close: Math.round(parseFloat(bar[4] as string) * 100) / 100,
        volume: Math.round(parseFloat(bar[5] as string) * 100) / 100,
      };
    } else {
      const yfInterval = interval === '4h' ? '1h' : interval;
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
          asset.ticker
        )}?interval=${yfInterval}&range=1d`,
        {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          cache: 'no-store',
        }
      );
      if (!res.ok) return null;
      const json = await res.json();
      const result = json.chart?.result?.[0];
      if (!result) return null;
      const ts = result.timestamp || [];
      const q = result.indicators?.quote?.[0] || {};
      const len = ts.length;
      if (len === 0) return null;

      const rawTime = ts[len - 1];
      const intervalSec = getIntervalSeconds(interval);
      const bucketTime = interval === '1d' ? rawTime : Math.floor(rawTime / intervalSec) * intervalSec;

      return {
        time: bucketTime,
        open: Math.round((q.open?.[len - 1] ?? q.close?.[len - 1]) * 100) / 100,
        high: Math.round((q.high?.[len - 1] ?? q.close?.[len - 1]) * 100) / 100,
        low: Math.round((q.low?.[len - 1] ?? q.close?.[len - 1]) * 100) / 100,
        close: Math.round((q.close?.[len - 1] ?? 0) * 100) / 100,
        volume: Math.round(q.volume?.[len - 1] ?? 0),
      };
    }
  } catch (error) {
    console.error('Error fetching latest candle:', error);
    return null;
  }
}
