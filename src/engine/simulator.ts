import { Candle } from '@/types/market';
import { Signal } from '@/types/strategy';
import { BacktestConfig, BacktestResult, Trade, EquityPoint, BacktestMetrics } from '@/types/backtest';

interface OpenPosition {
  id: string;
  type: 'LONG' | 'SHORT';
  entryTime: number;
  entryPrice: number;
  quantity: number;
  costBasis: number; // Cash allocated
  entryFee: number;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  sweepTime?: number;
  sweepPrice?: number;
  mssPrice?: number;
}

export function runBacktest(
  candles: Candle[],
  signals: Signal[],
  config: BacktestConfig
): BacktestResult {
  if (!candles || candles.length === 0) {
    throw new Error('Candles dataset is empty');
  }

  // Create quick signal lookup by timestamp
  const signalMap = new Map<number, Signal>();
  for (const sig of signals) {
    signalMap.set(sig.time, sig);
  }

  let cash = config.initialCapital;
  let currentPosition: OpenPosition | null = null;
  const completedTrades: Trade[] = [];
  const equityCurve: EquityPoint[] = [];

  let peakEquity = config.initialCapital;
  let maxDrawdownPercent = 0;
  let maxDrawdownDollar = 0;

  const initialPrice = candles[0].close;
  const benchmarkShares = config.initialCapital / initialPrice;

  const feeRate = (config.feePercent || 0) / 100;
  const slippageRate = (config.slippagePercent || 0) / 100;
  const defaultTpRate = config.takeProfitPercent ? config.takeProfitPercent / 100 : null;
  const defaultSlRate = config.stopLossPercent ? config.stopLossPercent / 100 : null;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const signal = signalMap.get(candle.time);

    // 1. If in position, check TP / SL / Close against current candle
    if (currentPosition) {
      let exitPrice: number | null = null;
      let exitReason: Trade['exitReason'] | null = null;

      if (currentPosition.type === 'LONG') {
        // Stop Loss for Long
        const slPrice =
          currentPosition.stopLossPrice ??
          (defaultSlRate !== null ? currentPosition.entryPrice * (1 - defaultSlRate) : null);

        if (slPrice !== null && candle.low <= slPrice) {
          exitPrice = slPrice;
          exitReason = 'SL';
        }

        // Take Profit for Long
        const tpPrice =
          currentPosition.takeProfitPrice ??
          (defaultTpRate !== null ? currentPosition.entryPrice * (1 + defaultTpRate) : null);

        if (tpPrice !== null && !exitPrice && candle.high >= tpPrice) {
          exitPrice = tpPrice;
          exitReason = 'TP';
        }

        // Signal Close for Long
        if (!exitPrice && signal && (signal.type === 'CLOSE' || signal.type === 'SELL')) {
          exitPrice = candle.close * (1 - slippageRate);
          exitReason = 'SIGNAL';
        }
      } else {
        // SHORT position exit checks
        // Stop Loss for Short (exit if price rises to/above SL)
        const slPrice =
          currentPosition.stopLossPrice ??
          (defaultSlRate !== null ? currentPosition.entryPrice * (1 + defaultSlRate) : null);

        if (slPrice !== null && candle.high >= slPrice) {
          exitPrice = slPrice;
          exitReason = 'SL';
        }

        // Take Profit for Short (exit if price drops to/below TP)
        const tpPrice =
          currentPosition.takeProfitPrice ??
          (defaultTpRate !== null ? currentPosition.entryPrice * (1 - defaultTpRate) : null);

        if (tpPrice !== null && !exitPrice && candle.low <= tpPrice) {
          exitPrice = tpPrice;
          exitReason = 'TP';
        }

        // Signal Close for Short
        if (!exitPrice && signal && (signal.type === 'CLOSE' || signal.type === 'BUY')) {
          exitPrice = candle.close * (1 + slippageRate);
          exitReason = 'SIGNAL';
        }
      }

      // Execute exit if triggered
      if (exitPrice !== null && exitReason !== null) {
        const exitFee = exitPrice * currentPosition.quantity * feeRate;
        const totalFee = currentPosition.entryFee + exitFee;
        let netPnl = 0;

        if (currentPosition.type === 'LONG') {
          const grossReturn = exitPrice * currentPosition.quantity;
          const netCashReturn = grossReturn - exitFee;
          netPnl = netCashReturn - currentPosition.costBasis;
          cash += netCashReturn;
        } else {
          // Short: PnL = (entryPrice - exitPrice) * qty - totalFee
          netPnl = (currentPosition.entryPrice - exitPrice) * currentPosition.quantity - totalFee;
          cash += currentPosition.costBasis + netPnl;
        }

        const pnlPercent = (netPnl / currentPosition.costBasis) * 100;

        completedTrades.push({
          id: currentPosition.id,
          type: currentPosition.type,
          entryTime: currentPosition.entryTime,
          entryPrice: currentPosition.entryPrice,
          exitTime: candle.time,
          exitPrice,
          quantity: currentPosition.quantity,
          pnl: netPnl,
          pnlPercent,
          feePaid: totalFee,
          exitReason,
          durationSeconds: candle.time - currentPosition.entryTime,
          stopLossPrice: currentPosition.stopLossPrice ?? undefined,
          takeProfitPrice: currentPosition.takeProfitPrice ?? undefined,
          sweepTime: currentPosition.sweepTime,
          sweepPrice: currentPosition.sweepPrice,
          mssPrice: currentPosition.mssPrice,
        });

        currentPosition = null;
      }
    }

    // 2. Check for new Entry signal if flat
    if (!currentPosition && signal && (signal.type === 'BUY' || signal.type === 'SELL')) {
      const isLong = signal.type === 'BUY';
      const fillPrice = isLong ? candle.close * (1 + slippageRate) : candle.close * (1 - slippageRate);
      const allocatedCapital = Math.max(0, cash);

      if (allocatedCapital > 10) {
        const grossQuantity = allocatedCapital / fillPrice;
        const entryFee = grossQuantity * fillPrice * feeRate;
        const actualQuantity = (allocatedCapital - entryFee) / fillPrice;

        currentPosition = {
          id: `trade_${completedTrades.length + 1}`,
          type: isLong ? 'LONG' : 'SHORT',
          entryTime: candle.time,
          entryPrice: fillPrice,
          quantity: actualQuantity,
          costBasis: allocatedCapital,
          entryFee,
          stopLossPrice: signal.stopLoss ?? null,
          takeProfitPrice: signal.takeProfit ?? null,
          sweepTime: signal.sweepTime,
          sweepPrice: signal.sweepPrice,
          mssPrice: signal.mssPrice,
        };

        cash = 0; // All cash deployed
      }
    }

    // 3. Mark to Market Equity calculation
    let currentEquity = cash;
    if (currentPosition) {
      if (currentPosition.type === 'LONG') {
        currentEquity = currentPosition.quantity * candle.close;
      } else {
        const unrealizedPnl = (currentPosition.entryPrice - candle.close) * currentPosition.quantity;
        currentEquity = Math.max(0, currentPosition.costBasis + unrealizedPnl);
      }
    }

    if (currentEquity > peakEquity) {
      peakEquity = currentEquity;
    }

    const currentDrawdownDollar = peakEquity - currentEquity;
    const currentDrawdownPercent = peakEquity > 0 ? (currentDrawdownDollar / peakEquity) * 100 : 0;

    if (currentDrawdownPercent > maxDrawdownPercent) {
      maxDrawdownPercent = currentDrawdownPercent;
    }
    if (currentDrawdownDollar > maxDrawdownDollar) {
      maxDrawdownDollar = currentDrawdownDollar;
    }

    const benchmarkEquity = benchmarkShares * candle.close;

    equityCurve.push({
      time: candle.time,
      equity: Math.round(currentEquity * 100) / 100,
      drawdownPercent: Math.round(currentDrawdownPercent * 100) / 100,
      benchmarkEquity: Math.round(benchmarkEquity * 100) / 100,
    });
  }

  // 4. Close any open position at the end of the data period
  if (currentPosition) {
    const lastCandle = candles[candles.length - 1];
    const exitPrice = lastCandle.close;
    const exitFee = exitPrice * currentPosition.quantity * feeRate;
    const totalFee = currentPosition.entryFee + exitFee;
    let netPnl = 0;

    if (currentPosition.type === 'LONG') {
      const grossReturn = exitPrice * currentPosition.quantity;
      const netCashReturn = grossReturn - exitFee;
      netPnl = netCashReturn - currentPosition.costBasis;
      cash += netCashReturn;
    } else {
      netPnl = (currentPosition.entryPrice - exitPrice) * currentPosition.quantity - totalFee;
      cash += currentPosition.costBasis + netPnl;
    }

    const pnlPercent = (netPnl / currentPosition.costBasis) * 100;

    completedTrades.push({
      id: currentPosition.id,
      type: currentPosition.type,
      entryTime: currentPosition.entryTime,
      entryPrice: currentPosition.entryPrice,
      exitTime: lastCandle.time,
      exitPrice,
      quantity: currentPosition.quantity,
      pnl: netPnl,
      pnlPercent,
      feePaid: totalFee,
      exitReason: 'END_OF_DATA',
      durationSeconds: lastCandle.time - currentPosition.entryTime,
      stopLossPrice: currentPosition.stopLossPrice ?? undefined,
      takeProfitPrice: currentPosition.takeProfitPrice ?? undefined,
      sweepTime: currentPosition.sweepTime,
      sweepPrice: currentPosition.sweepPrice,
      mssPrice: currentPosition.mssPrice,
    });
  }

  const finalEquity = cash;
  const netProfit = finalEquity - config.initialCapital;
  const netProfitPercent = (netProfit / config.initialCapital) * 100;

  // Calculate metrics
  const winningTrades = completedTrades.filter((t) => t.pnl > 0);
  const losingTrades = completedTrades.filter((t) => t.pnl <= 0);
  const totalTrades = completedTrades.length;

  const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;

  const grossProfit = winningTrades.reduce((acc, t) => acc + t.pnl, 0);
  const grossLoss = Math.abs(losingTrades.reduce((acc, t) => acc + t.pnl, 0));
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? 99.99 : 0) : grossProfit / grossLoss;

  const avgTradePercent =
    totalTrades > 0
      ? completedTrades.reduce((acc, t) => acc + t.pnlPercent, 0) / totalTrades
      : 0;

  // Simple Sharpe Ratio estimation
  const returns = completedTrades.map((t) => t.pnlPercent);
  const meanReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance =
    returns.length > 1
      ? returns.reduce((a, b) => a + Math.pow(b - meanReturn, 2), 0) / (returns.length - 1)
      : 0;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(Math.min(returns.length, 252)) : 0;

  const lastCandle = candles[candles.length - 1];
  const buyAndHoldReturnPercent = ((lastCandle.close - initialPrice) / initialPrice) * 100;

  const metrics: BacktestMetrics = {
    initialCapital: config.initialCapital,
    finalEquity: Math.round(finalEquity * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    netProfitPercent: Math.round(netProfitPercent * 100) / 100,
    totalTrades,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate: Math.round(winRate * 10) / 10,
    profitFactor: Math.round(profitFactor * 100) / 100,
    maxDrawdownPercent: Math.round(maxDrawdownPercent * 100) / 100,
    maxDrawdownDollar: Math.round(maxDrawdownDollar * 100) / 100,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    avgTradePercent: Math.round(avgTradePercent * 100) / 100,
    buyAndHoldReturnPercent: Math.round(buyAndHoldReturnPercent * 100) / 100,
  };

  return {
    config,
    metrics,
    trades: completedTrades,
    equityCurve,
    signals,
  };
}
