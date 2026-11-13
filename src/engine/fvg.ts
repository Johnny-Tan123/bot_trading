import { Candle } from '@/types/market';

export interface FVG {
  id: string;
  type: 'BULLISH' | 'BEARISH';
  isBAG: boolean; // Breakaway Gap: strong displacement + unmitigated breakaway
  startIndex: number;
  startTime: number;
  topPrice: number;
  bottomPrice: number;
  midpoint: number; // 50% Consequent Encroachment (CE)
  isMitigated: boolean;
  mitigatedTime?: number;
  mitigatedIndex?: number;
  unmitigatedBars: number;
}

/**
 * Detect all Fair Value Gaps (FVG) and Breakaway Gaps (BAG) across candles
 * Using strict 3-candle institutional price action imbalance criteria
 */
export function detectFVGs(candles: Candle[]): FVG[] {
  const fvgs: FVG[] = [];
  if (!candles || candles.length < 3) return fvgs;

  // Compute rolling average body size for displacement scoring
  let totalBody = 0;
  const sampleSize = Math.min(candles.length, 50);
  for (let i = 0; i < sampleSize; i++) {
    totalBody += Math.abs(candles[i].close - candles[i].open);
  }
  let avgBody = totalBody / sampleSize;

  for (let i = 2; i < candles.length; i++) {
    const cPrev2 = candles[i - 2];
    const cDisp = candles[i - 1]; // Middle displacement candle
    const cCurr = candles[i];

    const bodySize = Math.abs(cDisp.close - cDisp.open);
    avgBody = 0.95 * avgBody + 0.05 * bodySize;

    // Minimum gap threshold (0.02% of price) to eliminate micro-spread noise
    const minThreshold = 0.0002 * cDisp.close;

    // 1. Bullish FVG: Candle i-1 is bullish, and Low[i] > High[i-2]
    if (cDisp.close > cDisp.open && cCurr.low > cPrev2.high) {
      const top = cCurr.low;
      const bottom = cPrev2.high;
      const gapSize = top - bottom;

      if (gapSize >= minThreshold) {
        let isMitigated = false;
        let mitigatedIndex: number | undefined = undefined;
        let unmitigatedBars = 0;

        for (let j = i + 1; j < candles.length; j++) {
          if (candles[j].low <= top) {
            isMitigated = true;
            mitigatedIndex = j;
            break;
          }
          unmitigatedBars++;
        }

        // BAG: Massive displacement + price breaks away without returning for >= 5 bars
        const isBAG =
          bodySize >= 1.8 * avgBody &&
          (unmitigatedBars >= 5 || (!isMitigated && candles.length - i >= 5));

        fvgs.push({
          id: `fvg-bull-${cDisp.time}`,
          type: 'BULLISH',
          isBAG,
          startIndex: i - 1,
          startTime: cDisp.time,
          topPrice: Math.round(top * 100) / 100,
          bottomPrice: Math.round(bottom * 100) / 100,
          midpoint: Math.round(((top + bottom) / 2) * 100) / 100,
          isMitigated,
          mitigatedIndex,
          mitigatedTime: mitigatedIndex ? candles[mitigatedIndex].time : undefined,
          unmitigatedBars,
        });
      }
    }

    // 2. Bearish FVG: Candle i-1 is bearish, and High[i] < Low[i-2]
    if (cDisp.close < cDisp.open && cCurr.high < cPrev2.low) {
      const top = cPrev2.low;
      const bottom = cCurr.high;
      const gapSize = top - bottom;

      if (gapSize >= minThreshold) {
        let isMitigated = false;
        let mitigatedIndex: number | undefined = undefined;
        let unmitigatedBars = 0;

        for (let j = i + 1; j < candles.length; j++) {
          if (candles[j].high >= bottom) {
            isMitigated = true;
            mitigatedIndex = j;
            break;
          }
          unmitigatedBars++;
        }

        const isBAG =
          bodySize >= 1.8 * avgBody &&
          (unmitigatedBars >= 5 || (!isMitigated && candles.length - i >= 5));

        fvgs.push({
          id: `fvg-bear-${cDisp.time}`,
          type: 'BEARISH',
          isBAG,
          startIndex: i - 1,
          startTime: cDisp.time,
          topPrice: Math.round(top * 100) / 100,
          bottomPrice: Math.round(bottom * 100) / 100,
          midpoint: Math.round(((top + bottom) / 2) * 100) / 100,
          isMitigated,
          mitigatedIndex,
          mitigatedTime: mitigatedIndex ? candles[mitigatedIndex].time : undefined,
          unmitigatedBars,
        });
      }
    }
  }

  return fvgs;
}
