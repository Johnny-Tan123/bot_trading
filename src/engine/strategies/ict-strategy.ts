import { Candle } from '@/types/market';
import { Strategy, Signal } from '@/types/strategy';

export interface IctStrategyParams {
  riskRewardRatio: number; // e.g. 1.8 for 1:1.8
  swingLength: number; // Pivot swing lookback/lookforward
  requireFVG: boolean; // Require Fair Value Gap during displacement
  useTrendFilter: boolean; // Align with EMA 100 trend
  maxBarsAfterSweep: number; // Max bars allowed between sweep and MSS
}

interface Pivot {
  index: number;
  price: number;
  time: number;
}

export const ictStrategy: Strategy<IctStrategyParams> = {
  id: 'ict-liquidity-mss',
  name: 'ICT Liquidity Sweep + Market Structure Shift (MSS)',
  description:
    'Chiến thuật ICT Pro: Bắt Liquidity Sweep (quét râu SSL/BSL) kết hợp Market Structure Shift (MSS) phá vỡ cấu trúc đỉnh/đáy dẫn xuất, bắt buộc có nến dịch chuyển mạnh (Displacement), vùng mất cân bằng giá (FVG) và lọc theo xu hướng EMA 100.',
  defaultParams: {
    riskRewardRatio: 1.8,
    swingLength: 3,
    requireFVG: true,
    useTrendFilter: true,
    maxBarsAfterSweep: 12,
  },
  paramDefinitions: [
    {
      key: 'riskRewardRatio',
      label: 'Tỉ lệ R:R (Risk : Reward)',
      type: 'number',
      defaultValue: 1.8,
      min: 1,
      max: 5,
      step: 0.1,
    },
    {
      key: 'swingLength',
      label: 'Độ nhạy đỉnh/đáy (Swing Length)',
      type: 'number',
      defaultValue: 3,
      min: 2,
      max: 10,
      step: 1,
    },
    {
      key: 'requireFVG',
      label: 'Xác nhận Fair Value Gap (FVG)',
      type: 'boolean',
      defaultValue: true,
    },
    {
      key: 'useTrendFilter',
      label: 'Lọc thuận xu hướng (EMA 100)',
      type: 'boolean',
      defaultValue: true,
    },
    {
      key: 'maxBarsAfterSweep',
      label: 'Số nến tối đa chờ MSS sau Sweep',
      type: 'number',
      defaultValue: 12,
      min: 5,
      max: 30,
      step: 1,
    },
  ],
  execute: (candles: Candle[], params: IctStrategyParams): Signal[] => {
    const signals: Signal[] = [];
    const len = candles.length;
    const {
      riskRewardRatio = 1.8,
      swingLength = 3,
      requireFVG = true,
      useTrendFilter = true,
      maxBarsAfterSweep = 12,
    } = params;

    if (len < swingLength * 2 + 10) {
      return signals;
    }

    // Helper: Compute EMA 100 for higher timeframe trend filtering
    const emaPeriod = 100;
    const ema: number[] = [];
    const k = 2 / (emaPeriod + 1);
    let prevEma = candles[0].close;
    for (let i = 0; i < len; i++) {
      if (i === 0) {
        ema.push(prevEma);
      } else {
        const val = candles[i].close * k + prevEma * (1 - k);
        ema.push(val);
        prevEma = val;
      }
    }

    // Pre-calculate swing highs and swing lows (confirmed strictly without lookahead)
    const swingHighs: Pivot[] = [];
    const swingLows: Pivot[] = [];

    // State for tracking active pending sweeps
    let activeBullishSweep: {
      sweepIndex: number;
      sweepLowPrice: number;
      targetHighPrice: number;
    } | null = null;

    let activeBearishSweep: {
      sweepIndex: number;
      sweepHighPrice: number;
      targetLowPrice: number;
    } | null = null;

    // Minimum risk threshold (0.05% of price) | Max risk cap (1.5% of price)
    const minRiskThreshold = 0.0005;
    const maxRiskThreshold = 0.015;

    for (let i = swingLength * 2; i < len; i++) {
      const candidateIndex = i - swingLength;

      // 1. Check if candidateIndex is a confirmed Swing High
      let isHigh = true;
      for (let j = candidateIndex - swingLength; j <= candidateIndex + swingLength; j++) {
        if (j !== candidateIndex && candles[j].high >= candles[candidateIndex].high) {
          isHigh = false;
          break;
        }
      }
      if (isHigh) {
        swingHighs.push({
          index: candidateIndex,
          price: candles[candidateIndex].high,
          time: candles[candidateIndex].time,
        });
      }

      // 2. Check if candidateIndex is a confirmed Swing Low
      let isLow = true;
      for (let j = candidateIndex - swingLength; j <= candidateIndex + swingLength; j++) {
        if (j !== candidateIndex && candles[j].low <= candles[candidateIndex].low) {
          isLow = false;
          break;
        }
      }
      if (isLow) {
        swingLows.push({
          index: candidateIndex,
          price: candles[candidateIndex].low,
          time: candles[candidateIndex].time,
        });
      }

      const currentCandle = candles[i];

      // 3. Detect BULLISH Setup: Liquidity Sweep of Sell-Side Liquidity (SSL)
      if (!activeBullishSweep) {
        const trendOk = !useTrendFilter || currentCandle.close >= ema[i] * 0.99;

        if (trendOk) {
          for (let s = swingLows.length - 1; s >= 0; s--) {
            const pivotLow = swingLows[s];
            if (pivotLow.index >= i - 1) continue;
            if (i - pivotLow.index > 50) break;

            // Did current candle sweep below this pivot low?
            if (currentCandle.low < pivotLow.price) {
              const isWickSweep =
                currentCandle.close >= pivotLow.price ||
                currentCandle.close - currentCandle.low > (currentCandle.high - currentCandle.low) * 0.35;

              if (isWickSweep) {
                // Find the immediate previous swing high leading down to this sweep
                let targetH: number | null = null;
                for (let h = swingHighs.length - 1; h >= 0; h--) {
                  if (swingHighs[h].index > pivotLow.index && swingHighs[h].index < i) {
                    targetH = swingHighs[h].price;
                    break;
                  }
                }
                if (!targetH) {
                  let maxH = -Infinity;
                  for (let k = Math.max(pivotLow.index, i - 12); k < i; k++) {
                    if (candles[k].high > maxH) maxH = candles[k].high;
                  }
                  targetH = maxH;
                }

                const riskEstimate = targetH - currentCandle.low;
                if (targetH > currentCandle.low && riskEstimate <= currentCandle.low * maxRiskThreshold) {
                  activeBullishSweep = {
                    sweepIndex: i,
                    sweepLowPrice: currentCandle.low,
                    targetHighPrice: targetH,
                  };
                  break;
                }
              }
            }
          }
        }
      } else {
        if (currentCandle.low < activeBullishSweep.sweepLowPrice) {
          activeBullishSweep.sweepLowPrice = currentCandle.low;
        }

        const barsSinceSweep = i - activeBullishSweep.sweepIndex;

        // Check for Market Structure Shift (MSS): Body close breaks above targetHighPrice
        if (currentCandle.close > activeBullishSweep.targetHighPrice) {
          // Check for Fair Value Gap (FVG) in the displacement leg
          let hasFVG = !requireFVG;
          if (requireFVG) {
            for (let k = activeBullishSweep.sweepIndex; k <= i; k++) {
              if (k >= 2 && candles[k].low > candles[k - 2].high) {
                hasFVG = true;
                break;
              }
            }
          }

          const entryPrice = currentCandle.close;
          const stopLoss = activeBullishSweep.sweepLowPrice;
          const risk = entryPrice - stopLoss;
          const bodyRatio =
            (currentCandle.close - currentCandle.open) / (currentCandle.high - currentCandle.low || 1);

          if (
            hasFVG &&
            risk >= entryPrice * minRiskThreshold &&
            risk <= entryPrice * maxRiskThreshold &&
            bodyRatio >= 0.35
          ) {
            const takeProfit = entryPrice + risk * riskRewardRatio;

            signals.push({
              time: currentCandle.time,
              type: 'BUY',
              price: entryPrice,
              stopLoss: Math.round(stopLoss * 100) / 100,
              takeProfit: Math.round(takeProfit * 100) / 100,
              sweepTime: candles[activeBullishSweep.sweepIndex].time,
              sweepPrice: Math.round(activeBullishSweep.sweepLowPrice * 100) / 100,
              mssTime: currentCandle.time,
              mssPrice: Math.round(activeBullishSweep.targetHighPrice * 100) / 100,
              reason: `ICT Bullish: SSL Swept ($${stopLoss.toFixed(1)}) + MSS Breakout ($${entryPrice.toFixed(1)}) + FVG Imbalance | 1:${riskRewardRatio} RR`,
            });

            activeBullishSweep = null;
          }
        } else if (barsSinceSweep > maxBarsAfterSweep) {
          activeBullishSweep = null;
        }
      }

      // 4. Detect BEARISH Setup: Liquidity Sweep of Buy-Side Liquidity (BSL)
      if (!activeBearishSweep) {
        const trendOk = !useTrendFilter || currentCandle.close <= ema[i] * 1.01;

        if (trendOk) {
          for (let s = swingHighs.length - 1; s >= 0; s--) {
            const pivotHigh = swingHighs[s];
            if (pivotHigh.index >= i - 1) continue;
            if (i - pivotHigh.index > 50) break;

            // Did current candle sweep above this pivot high?
            if (currentCandle.high > pivotHigh.price) {
              const isWickSweep =
                currentCandle.close <= pivotHigh.price ||
                currentCandle.high - currentCandle.close > (currentCandle.high - currentCandle.low) * 0.35;

              if (isWickSweep) {
                // Find immediate previous swing low leading up to this sweep
                let targetL: number | null = null;
                for (let l = swingLows.length - 1; l >= 0; l--) {
                  if (swingLows[l].index > pivotHigh.index && swingLows[l].index < i) {
                    targetL = swingLows[l].price;
                    break;
                  }
                }
                if (!targetL) {
                  let minL = Infinity;
                  for (let k = Math.max(pivotHigh.index, i - 12); k < i; k++) {
                    if (candles[k].low < minL) minL = candles[k].low;
                  }
                  targetL = minL;
                }

                const riskEstimate = currentCandle.high - targetL;
                if (targetL < currentCandle.high && riskEstimate <= currentCandle.high * maxRiskThreshold) {
                  activeBearishSweep = {
                    sweepIndex: i,
                    sweepHighPrice: currentCandle.high,
                    targetLowPrice: targetL,
                  };
                  break;
                }
              }
            }
          }
        }
      } else {
        if (currentCandle.high > activeBearishSweep.sweepHighPrice) {
          activeBearishSweep.sweepHighPrice = currentCandle.high;
        }

        const barsSinceSweep = i - activeBearishSweep.sweepIndex;

        // Check for Market Structure Shift (MSS): Body close breaks below targetLowPrice
        if (currentCandle.close < activeBearishSweep.targetLowPrice) {
          let hasFVG = !requireFVG;
          if (requireFVG) {
            for (let k = activeBearishSweep.sweepIndex; k <= i; k++) {
              if (k >= 2 && candles[k].high < candles[k - 2].low) {
                hasFVG = true;
                break;
              }
            }
          }

          const entryPrice = currentCandle.close;
          const stopLoss = activeBearishSweep.sweepHighPrice;
          const risk = stopLoss - entryPrice;
          const bodyRatio =
            (currentCandle.open - currentCandle.close) / (currentCandle.high - currentCandle.low || 1);

          if (
            hasFVG &&
            risk >= entryPrice * minRiskThreshold &&
            risk <= entryPrice * maxRiskThreshold &&
            bodyRatio >= 0.35
          ) {
            const takeProfit = entryPrice - risk * riskRewardRatio;

            signals.push({
              time: currentCandle.time,
              type: 'SELL',
              price: entryPrice,
              stopLoss: Math.round(stopLoss * 100) / 100,
              takeProfit: Math.round(takeProfit * 100) / 100,
              sweepTime: candles[activeBearishSweep.sweepIndex].time,
              sweepPrice: Math.round(activeBearishSweep.sweepHighPrice * 100) / 100,
              mssTime: currentCandle.time,
              mssPrice: Math.round(activeBearishSweep.targetLowPrice * 100) / 100,
              reason: `ICT Bearish: BSL Swept ($${stopLoss.toFixed(1)}) + MSS Breakdown ($${entryPrice.toFixed(1)}) + FVG Imbalance | 1:${riskRewardRatio} RR`,
            });

            activeBearishSweep = null;
          }
        } else if (barsSinceSweep > maxBarsAfterSweep) {
          activeBearishSweep = null;
        }
      }
    }

    return signals;
  },
};
