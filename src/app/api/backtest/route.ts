import { NextRequest, NextResponse } from 'next/server';
import { fetchMarketKlines } from '@/lib/market-data';
import { getStrategyById } from '@/engine/strategies';
import { runBacktest } from '@/engine/simulator';
import { BacktestConfig } from '@/types/backtest';
import { Timeframe } from '@/types/market';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      symbol = 'XAU',
      timeframe = '1h',
      strategyId = 'ict-liquidity-mss',
      strategyParams = {},
      config = {
        initialCapital: 10000,
        feePercent: 0.05,
        slippagePercent: 0.01,
        takeProfitPercent: 10,
        stopLossPercent: 5,
      },
      limit = 5000,
    } = body;

    // 1. Fetch candles from Market Data (XAU, US100, US500)
    const candles = await fetchMarketKlines(symbol, timeframe as Timeframe, limit);

    // 2. Resolve Strategy
    const strategy = getStrategyById(strategyId);
    if (!strategy) {
      return NextResponse.json({ error: `Strategy with id ${strategyId} not found` }, { status: 400 });
    }

    const mergedParams = { ...strategy.defaultParams, ...strategyParams };

    // 3. Execute Strategy signals
    const signals = strategy.execute(candles, mergedParams);

    // 4. Run Backtest Simulation
    const result = runBacktest(candles, signals, config as BacktestConfig);

    return NextResponse.json({
      success: true,
      symbol,
      timeframe,
      strategy: {
        id: strategy.id,
        name: strategy.name,
        params: mergedParams,
      },
      candles,
      result,
    });
  } catch (error: unknown) {
    console.error('Backtest API error:', error);
    const msg = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
