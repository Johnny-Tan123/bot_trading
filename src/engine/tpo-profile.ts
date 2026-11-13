import { Candle } from '@/types/market';

export const TPO_LETTERS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
];

export interface TPOPriceLevel {
  price: number;
  priceLow: number;
  priceHigh: number;
  tpoCount: number;
  letters: string[];
  volume: number;
  isTPOC: boolean;
  isValueArea: boolean;
  isSinglePrint: boolean;
}

export type TPOProfileType =
  | 'NORMAL'
  | 'TREND'
  | 'DOUBLE_DISTRIBUTION'
  | 'P_SHAPE'
  | 'B_SHAPE';

export interface TPOSession {
  sessionId: string;
  date: string;
  startTime: number;
  endTime: number;
  high: number;
  low: number;
  open: number;
  close: number;
  totalTPOs: number;
  tpocPrice: number;
  tpocCount: number;
  vah: number;
  val: number;
  ibHigh: number; // Initial Balance High (A + B periods)
  ibLow: number; // Initial Balance Low
  ibRange: number;
  levels: TPOPriceLevel[];
  singlePrints: number[];
  hasPoorHigh: boolean;
  hasPoorLow: boolean;
  profileType: TPOProfileType;
}

export interface TPOResult {
  sessions: TPOSession[];
  activeSession: TPOSession | null;
}

/**
 * Calculate TPO (Time Price Opportunity / Market Profile)
 * Groups candles by trading day / session and builds 30-minute letter distributions
 */
export function calculateTPOProfile(
  candles: Candle[],
  numBinsPerSession: number = 40
): TPOResult {
  if (!candles || candles.length === 0) {
    return { sessions: [], activeSession: null };
  }

  // 1. Group candles into sessions (by 24h / Calendar day boundaries)
  const sessionMap = new Map<string, Candle[]>();

  candles.forEach((c) => {
    const dateObj = new Date(c.time * 1000);
    const dateKey = dateObj.toISOString().slice(0, 10); // 'YYYY-MM-DD'
    if (!sessionMap.has(dateKey)) {
      sessionMap.set(dateKey, []);
    }
    sessionMap.get(dateKey)!.push(c);
  });

  const sessionKeys = Array.from(sessionMap.keys());
  const sessions: TPOSession[] = [];

  sessionKeys.forEach((dateKey) => {
    const sessionCandles = sessionMap.get(dateKey)!;
    if (sessionCandles.length < 2) return;

    let sMin = Infinity;
    let sMax = -Infinity;
    let sOpen = sessionCandles[0].open;
    let sClose = sessionCandles[sessionCandles.length - 1].close;

    sessionCandles.forEach((c) => {
      if (c.low < sMin) sMin = c.low;
      if (c.high > sMax) sMax = c.high;
    });

    if (sMin >= sMax) return;

    const sRange = sMax - sMin;
    const binSize = sRange / numBinsPerSession;

    // Initialize price levels for this session
    const levels: TPOPriceLevel[] = Array.from({ length: numBinsPerSession }, (_, idx) => {
      const pLow = sMin + idx * binSize;
      const pHigh = pLow + binSize;
      return {
        price: Math.round(((pLow + pHigh) / 2) * 100) / 100,
        priceLow: Math.round(pLow * 100) / 100,
        priceHigh: Math.round(pHigh * 100) / 100,
        tpoCount: 0,
        letters: [],
        volume: 0,
        isTPOC: false,
        isValueArea: false,
        isSinglePrint: false,
      };
    });

    // Initial Balance tracking (Periods A & B, typically the first 2 candles/hours)
    let ibHigh = -Infinity;
    let ibLow = Infinity;
    const ibCandlesCount = Math.min(2, sessionCandles.length);
    for (let i = 0; i < ibCandlesCount; i++) {
      if (sessionCandles[i].high > ibHigh) ibHigh = sessionCandles[i].high;
      if (sessionCandles[i].low < ibLow) ibLow = sessionCandles[i].low;
    }

    // Assign letters (Periods) to each candle or 30m/1h step
    let totalTPOs = 0;

    sessionCandles.forEach((c, cIdx) => {
      const letter = TPO_LETTERS[cIdx % TPO_LETTERS.length];
      const startBin = Math.max(0, Math.min(numBinsPerSession - 1, Math.floor((c.low - sMin) / binSize)));
      const endBin = Math.max(0, Math.min(numBinsPerSession - 1, Math.floor((c.high - sMin) / binSize)));

      const binsCount = Math.max(1, endBin - startBin + 1);
      const volShare = c.volume / binsCount;

      for (let b = startBin; b <= endBin; b++) {
        if (!levels[b].letters.includes(letter)) {
          levels[b].letters.push(letter);
          levels[b].tpoCount++;
          totalTPOs++;
        }
        levels[b].volume += volShare;
      }
    });

    // Find TPO POC
    let maxCount = -Infinity;
    let tpocIndex = 0;

    levels.forEach((lvl, idx) => {
      lvl.volume = Math.round(lvl.volume * 100) / 100;
      if (lvl.tpoCount > maxCount) {
        maxCount = lvl.tpoCount;
        tpocIndex = idx;
      }
    });

    levels[tpocIndex].isTPOC = true;
    levels[tpocIndex].isValueArea = true;

    // Calculate TPO Value Area (70% of TPOs)
    const targetTPOs = totalTPOs * 0.7;
    let currentTPOs = levels[tpocIndex].tpoCount;

    let upIdx = tpocIndex + 1;
    let downIdx = tpocIndex - 1;

    while (currentTPOs < targetTPOs && (upIdx < numBinsPerSession || downIdx >= 0)) {
      const upCount = upIdx < numBinsPerSession ? levels[upIdx].tpoCount : -1;
      const downCount = downIdx >= 0 ? levels[downIdx].tpoCount : -1;

      if (upCount >= downCount && upIdx < numBinsPerSession) {
        levels[upIdx].isValueArea = true;
        currentTPOs += upCount;
        upIdx++;
      } else if (downIdx >= 0) {
        levels[downIdx].isValueArea = true;
        currentTPOs += downCount;
        downIdx--;
      } else if (upIdx < numBinsPerSession) {
        levels[upIdx].isValueArea = true;
        currentTPOs += upCount;
        upIdx++;
      } else {
        break;
      }
    }

    const vaLevels = levels.filter((l) => l.isValueArea);
    const val = vaLevels.length > 0 ? vaLevels[0].priceLow : sMin;
    const vah = vaLevels.length > 0 ? vaLevels[vaLevels.length - 1].priceHigh : sMax;

    // Single Prints: single letter in the interior of the profile (between extremes)
    const singlePrints: number[] = [];
    for (let i = 2; i < numBinsPerSession - 2; i++) {
      if (levels[i].tpoCount === 1) {
        levels[i].isSinglePrint = true;
        singlePrints.push(levels[i].price);
      }
    }

    // Poor High & Poor Low: Extremes without single-print excess tails (cut-off auction)
    const topBin = levels[numBinsPerSession - 1];
    const bottomBin = levels[0];
    const hasPoorHigh = topBin.tpoCount >= 2;
    const hasPoorLow = bottomBin.tpoCount >= 2;

    // Classify Profile Shape
    let profileType: TPOProfileType = 'NORMAL';
    const tpocRelativePos = tpocIndex / numBinsPerSession; // 0 (bottom) to 1 (top)

    if (singlePrints.length >= 4) {
      profileType = 'DOUBLE_DISTRIBUTION';
    } else if (sRange > (ibHigh - ibLow) * 2.2) {
      profileType = 'TREND';
    } else if (tpocRelativePos >= 0.65) {
      profileType = 'P_SHAPE';
    } else if (tpocRelativePos <= 0.35) {
      profileType = 'B_SHAPE';
    }

    sessions.push({
      sessionId: `tpo-${dateKey}`,
      date: dateKey,
      startTime: sessionCandles[0].time,
      endTime: sessionCandles[sessionCandles.length - 1].time,
      high: Math.round(sMax * 100) / 100,
      low: Math.round(sMin * 100) / 100,
      open: Math.round(sOpen * 100) / 100,
      close: Math.round(sClose * 100) / 100,
      totalTPOs,
      tpocPrice: levels[tpocIndex].price,
      tpocCount: maxCount,
      vah: Math.round(vah * 100) / 100,
      val: Math.round(val * 100) / 100,
      ibHigh: Math.round(ibHigh * 100) / 100,
      ibLow: Math.round(ibLow * 100) / 100,
      ibRange: Math.round((ibHigh - ibLow) * 100) / 100,
      levels,
      singlePrints,
      hasPoorHigh,
      hasPoorLow,
      profileType,
    });
  });

  const activeSession = sessions.length > 0 ? sessions[sessions.length - 1] : null;

  return {
    sessions,
    activeSession,
  };
}
