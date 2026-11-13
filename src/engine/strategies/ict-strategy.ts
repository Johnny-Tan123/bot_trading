import { Candle } from '@/types/market';
import { Strategy, Signal } from '@/types/strategy';

export interface IctStrategyParams {
  riskRewardRatio: number; // e.g. 3 for 1:3
  swingLength: number;     // Pivot swing lookback/lookforward
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
    'Chiến thuật ICT chuẩn: Vào lệnh khi có Liquidity Sweep (quét râu thanh khoản đỉnh/đáy) kết hợp Market Structure Shift (phá vỡ cấu trúc thị trường). Stop loss đặt ngay râu nến quét thanh khoản, chốt lời theo tỉ lệ R:R tùy chỉnh (mặc định 1:3).',
  defaultParams: {
    riskRewardRatio: 3,
    swingLength: 5,
    maxBarsAfterSweep: 15,
  },
  paramDefinitions: [
    {
      key: 'riskRewardRatio',
      label: 'Tỉ lệ R:R (Risk : Reward)',
      type: 'number',
      defaultValue: 3,
      min: 1,
      max: 10,
      step: 0.5,
    },
    {
      key: 'swingLength',
      label: 'Độ nhạy đỉnh/đáy (Swing Length)',
      type: 'number',
      defaultValue: 5,
      min: 2,
      max: 20,
      step: 1,
    },
    {
      key: 'maxBarsAfterSweep',
      label: 'Số nến tối đa chờ MSS sau Sweep',
      type: 'number',
      defaultValue: 15,
      min: 5,
      max: 40,
      step: 1,
    },
  ],
  execute: (candles: Candle[], params: IctStrategyParams): Signal[] => {
    const signals: Signal[] = [];
    const len = candles.length;
    const { riskRewardRatio, swingLength, maxBarsAfterSweep } = params;

    if (len < swingLength * 2 + 5) {
      return signals;
    }

    // Pre-calculate swing highs and swing lows (confirmed strictly without lookahead)
    // A pivot at index `p` is confirmed at index `p + swingLength`
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

    // Minimum risk threshold (0.05% of price) to prevent micro-ranges
    const minRiskThreshold = 0.0005;

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
      // Look for the most recent swing low that hasn't been swept yet
      if (!activeBullishSweep) {
        // Find recent swing low in the last 100 bars
        for (let s = swingLows.length - 1; s >= 0; s--) {
          const pivotLow = swingLows[s];
          if (pivotLow.index >= i - 2) continue; // Must be sufficiently prior
          if (i - pivotLow.index > 120) break;

          // Did current candle sweep below this pivot low?
          if (currentCandle.low < pivotLow.price) {
            // Wick swept below, and closed back above or closed with rejection
            const isWickSweep =
              currentCandle.close >= pivotLow.price ||
              currentCandle.close - currentCandle.low > (currentCandle.high - currentCandle.low) * 0.4;

            if (isWickSweep) {
              // Find intermediate swing high between pivotLow and current candle
              let maxIntermediateHigh = pivotLow.price;
              for (let k = pivotLow.index; k < i; k++) {
                if (candles[k].high > maxIntermediateHigh) {
                  maxIntermediateHigh = candles[k].high;
                }
              }

              if (maxIntermediateHigh > currentCandle.low * 1.002) {
                activeBullishSweep = {
                  sweepIndex: i,
                  sweepLowPrice: currentCandle.low, // Râu nến quét thanh khoản (SL)
                  targetHighPrice: maxIntermediateHigh, // Cần phá vỡ đỉnh này để xác nhận MSS
                };
                break;
              }
            }
          }
        }
      } else {
        // We have an active bullish sweep, update the lowest sweep wick if it goes lower
        if (currentCandle.low < activeBullishSweep.sweepLowPrice) {
          activeBullishSweep.sweepLowPrice = currentCandle.low;
        }

        const barsSinceSweep = i - activeBullishSweep.sweepIndex;

        // Check for Market Structure Shift (MSS): Body close breaks above targetHighPrice
        if (currentCandle.close > activeBullishSweep.targetHighPrice) {
          const entryPrice = currentCandle.close;
          const stopLoss = activeBullishSweep.sweepLowPrice;
          const risk = entryPrice - stopLoss;

          if (risk > entryPrice * minRiskThreshold) {
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
              reason: `ICT Bullish: SSL Swept ($${stopLoss.toFixed(1)}) + MSS Breakout ($${entryPrice.toFixed(1)}) | 1:${riskRewardRatio} RR`,
            });

            activeBullishSweep = null; // Reset setup
          }
        } else if (barsSinceSweep > maxBarsAfterSweep) {
          // Expired if MSS didn't happen in time
          activeBullishSweep = null;
        }
      }

      // 4. Detect BEARISH Setup: Liquidity Sweep of Buy-Side Liquidity (BSL)
      if (!activeBearishSweep) {
        for (let s = swingHighs.length - 1; s >= 0; s--) {
          const pivotHigh = swingHighs[s];
          if (pivotHigh.index >= i - 2) continue;
          if (i - pivotHigh.index > 120) break;

          // Did current candle sweep above this pivot high?
          if (currentCandle.high > pivotHigh.price) {
            const isWickSweep =
              currentCandle.close <= pivotHigh.price ||
              currentCandle.high - currentCandle.close > (currentCandle.high - currentCandle.low) * 0.4;

            if (isWickSweep) {
              // Find intermediate swing low between pivotHigh and current candle
              let minIntermediateLow = pivotHigh.price;
              for (let k = pivotHigh.index; k < i; k++) {
                if (candles[k].low < minIntermediateLow) {
                  minIntermediateLow = candles[k].low;
                }
              }

              if (minIntermediateLow < currentCandle.high * 0.998) {
                activeBearishSweep = {
                  sweepIndex: i,
                  sweepHighPrice: currentCandle.high, // Râu nến quét thanh khoản (SL)
                  targetLowPrice: minIntermediateLow, // Cần phá vỡ đáy này để xác nhận MSS
                };
                break;
              }
            }
          }
        }
      } else {
        // Update highest sweep wick if it goes higher
        if (currentCandle.high > activeBearishSweep.sweepHighPrice) {
          activeBearishSweep.sweepHighPrice = currentCandle.high;
        }

        const barsSinceSweep = i - activeBearishSweep.sweepIndex;

        // Check for Market Structure Shift (MSS): Body close breaks below targetLowPrice
        if (currentCandle.close < activeBearishSweep.targetLowPrice) {
          const entryPrice = currentCandle.close;
          const stopLoss = activeBearishSweep.sweepHighPrice;
          const risk = stopLoss - entryPrice;

          if (risk > entryPrice * minRiskThreshold) {
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
              reason: `ICT Bearish: BSL Swept ($${stopLoss.toFixed(1)}) + MSS Breakdown ($${entryPrice.toFixed(1)}) | 1:${riskRewardRatio} RR`,
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
