'use client';

import React, { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { Header } from '@/components/Header';
import { MetricCards } from '@/components/MetricCards';
import { ControlBar } from '@/components/ControlBar';
import { StrategyPanel } from '@/components/StrategyPanel';
import { CandlestickChart } from '@/components/CandlestickChart';
import { EquityChart } from '@/components/EquityChart';
import { TPOChart } from '@/components/TPOChart';
import { TradeTable } from '@/components/TradeTable';
import { Timeframe, Candle } from '@/types/market';
import { BacktestResult, Trade } from '@/types/backtest';
import { ictStrategy } from '@/engine/strategies';
import { Info, AlertCircle } from 'lucide-react';

function useIsMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

export default function DashboardPage() {
  const mounted = useIsMounted();

  // Market controls
  const [symbol, setSymbol] = useState<string>('XAU');
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [limit, setLimit] = useState<number>(1000);
  const [isLiveSync, setIsLiveSync] = useState<boolean>(true);

  // Strategy & Risk controls
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('ict-liquidity-mss');
  const [strategyParams, setStrategyParams] = useState<Record<string, unknown>>({
    ...ictStrategy.defaultParams,
  });
  const [initialCapital, setInitialCapital] = useState<number>(10000);
  const [feePercent, setFeePercent] = useState<number>(0.05);
  const [slippagePercent, setSlippagePercent] = useState<number>(0.01);
  const [takeProfitPercent, setTakeProfitPercent] = useState<number>(10);
  const [stopLossPercent, setStopLossPercent] = useState<number>(4);

  // Backtest state
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [result, setResult] = useState<BacktestResult | null>(null);

  // Active view tab for charts
  const [activeTab, setActiveTab] = useState<'CANDLE' | 'TPO' | 'EQUITY'>('CANDLE');
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);

  const executeBacktest = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          timeframe,
          limit,
          strategyId: selectedStrategyId,
          strategyParams,
          config: {
            initialCapital,
            feePercent,
            slippagePercent,
            takeProfitPercent: takeProfitPercent > 0 ? takeProfitPercent : undefined,
            stopLossPercent: stopLossPercent > 0 ? stopLossPercent : undefined,
          },
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to run backtest');
      }

      const data = await response.json();
      setCandles(data.candles);
      setResult(data.result);
      setSelectedTrade(null);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'An error occurred while executing the backtest');
    } finally {
      setLoading(false);
    }
  }, [
    symbol,
    timeframe,
    limit,
    selectedStrategyId,
    strategyParams,
    initialCapital,
    feePercent,
    slippagePercent,
    takeProfitPercent,
    stopLossPercent,
  ]);

  // Auto-run backtest on initial mount and whenever Symbol, Timeframe, or Limit changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    executeBacktest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe, limit]);

  // Handler for live candle tick update
  const handleLiveCandleUpdate = useCallback((liveCandle: Candle) => {
    setCandles((prev) => {
      if (!prev || prev.length === 0) return prev;
      const last = prev[prev.length - 1];

      if (liveCandle.time === last.time) {
        // Update current candle values
        const updated = [...prev];
        updated[updated.length - 1] = {
          time: liveCandle.time,
          open: last.open,
          high: Math.max(last.high, liveCandle.high),
          low: Math.min(last.low, liveCandle.low),
          close: liveCandle.close,
          volume: Math.max(last.volume, liveCandle.volume),
        };
        return updated;
      } else if (liveCandle.time > last.time) {
        const intervalSec =
          timeframe === '15m'
            ? 900
            : timeframe === '1h'
            ? 3600
            : timeframe === '4h'
            ? 14400
            : 86400;

        // If missed more than 1 bar (e.g. computer was asleep, server paused), auto re-sync full dataset
        if (liveCandle.time - last.time > intervalSec * 1.5) {
          executeBacktest();
          return prev;
        }

        // Normal new candle started: append cleanly
        return [...prev, liveCandle];
      }
      return prev;
    });
  }, [timeframe, executeBacktest]);

  // 1. Direct WebSocket for Gold (XAU) - Zero Latency, 24/7 Live Ticking directly from Bybit
  useEffect(() => {
    if (!isLiveSync || loading || symbol !== 'XAU') return;

    const topicInterval =
      timeframe === '15m' ? '15' : timeframe === '4h' ? '240' : timeframe === '1d' ? 'D' : '60';

    let ws: WebSocket | null = null;
    let isSubscribed = true;

    try {
      ws = new WebSocket('wss://stream.bybit.com/v5/public/linear');

      ws.onopen = () => {
        if (!isSubscribed || !ws) return;
        ws.send(
          JSON.stringify({
            op: 'subscribe',
            args: [`kline.${topicInterval}.XAUUSDT`],
          })
        );
      };

      ws.onmessage = (event) => {
        if (!isSubscribed) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.topic && msg.data && msg.data[0]) {
            const d = msg.data[0];
            handleLiveCandleUpdate({
              time: Math.floor(Number(d.start) / 1000),
              open: Math.round(parseFloat(d.open) * 100) / 100,
              high: Math.round(parseFloat(d.high) * 100) / 100,
              low: Math.round(parseFloat(d.low) * 100) / 100,
              close: Math.round(parseFloat(d.close) * 100) / 100,
              volume: Math.round(parseFloat(d.volume) * 100) / 100,
            });
          }
        } catch {
          // ignore parsing error
        }
      };

      ws.onerror = () => {
        // Fallback polling will handle updates seamlessly
      };
    } catch {
      // ignore
    }

    return () => {
      isSubscribed = false;
      if (ws) {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
    };
  }, [isLiveSync, loading, symbol, timeframe, handleLiveCandleUpdate]);

  // 2. Realtime Polling Fallback (For US100, US500, and as backup for XAU)
  useEffect(() => {
    if (!isLiveSync || loading) return;

    const topicInterval =
      timeframe === '15m' ? '15' : timeframe === '4h' ? '240' : timeframe === '1d' ? 'D' : '60';

    const intervalId = setInterval(async () => {
      try {
        let liveCandle: Candle | null = null;

        // Try local / Vercel API endpoint first
        try {
          const res = await fetch(
            `/api/live-candle?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}`,
            { cache: 'no-store' }
          );
          if (res.ok) {
            const data = await res.json();
            liveCandle = data.candle;
          }
        } catch {
          // ignore API error
        }

        // Direct client-side Bybit fallback for Gold if API is cold-starting or offline
        if (!liveCandle && symbol === 'XAU') {
          try {
            const bbRes = await fetch(
              `https://api.bybit.com/v5/market/kline?category=linear&symbol=XAUUSDT&interval=${topicInterval}&limit=1`,
              { cache: 'no-store' }
            );
            if (bbRes.ok) {
              const bbJson = await bbRes.json();
              const bar = bbJson.result?.list?.[0];
              if (bar) {
                liveCandle = {
                  time: Math.floor(Number(bar[0]) / 1000),
                  open: Math.round(parseFloat(bar[1] as string) * 100) / 100,
                  high: Math.round(parseFloat(bar[2] as string) * 100) / 100,
                  low: Math.round(parseFloat(bar[3] as string) * 100) / 100,
                  close: Math.round(parseFloat(bar[4] as string) * 100) / 100,
                  volume: Math.round(parseFloat(bar[5] as string) * 100) / 100,
                };
              }
            }
          } catch {
            // ignore
          }
        }

        if (liveCandle) {
          handleLiveCandleUpdate(liveCandle);
        }
      } catch {
        // Silently ignore live polling network errors
      }
    }, 4000);

    return () => clearInterval(intervalId);
  }, [isLiveSync, loading, symbol, timeframe, handleLiveCandleUpdate]);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center font-mono text-xs text-zinc-500">
        Initializing terminal...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-zinc-950">
      <Header />

      <main className="flex-1 p-4 lg:p-6 max-w-[1600px] w-full mx-auto flex flex-col gap-5">
        {/* Top Control Bar */}
        <ControlBar
          symbol={symbol}
          setSymbol={setSymbol}
          timeframe={timeframe}
          setTimeframe={setTimeframe}
          limit={limit}
          setLimit={setLimit}
          initialCapital={initialCapital}
          setInitialCapital={setInitialCapital}
          feePercent={feePercent}
          setFeePercent={setFeePercent}
          slippagePercent={slippagePercent}
          setSlippagePercent={setSlippagePercent}
          onRunBacktest={executeBacktest}
          loading={loading}
          isLiveSync={isLiveSync}
          setIsLiveSync={setIsLiveSync}
        />

        {/* Error notification if any */}
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-3 rounded-xl flex items-center gap-2 text-xs">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Top Metrics HUD */}
        <MetricCards metrics={result ? result.metrics : null} loading={loading} />

        {/* Main Content Grid: 3/4 Chart & Trade log, 1/4 Strategy Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
          {/* Main Visual & Logs Area (3 cols) */}
          <div className="lg:col-span-3 flex flex-col gap-5">
            {/* Chart Container with Tab Selector */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 bg-zinc-900/80 p-1 rounded-lg border border-zinc-800 text-xs">
                  <button
                    onClick={() => setActiveTab('CANDLE')}
                    className={`px-3 py-1.5 rounded-md font-semibold transition cursor-pointer ${
                      activeTab === 'CANDLE'
                        ? 'bg-zinc-800 text-emerald-400 shadow-sm border border-zinc-700'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Candlestick & Signals
                  </button>
                  <button
                    onClick={() => setActiveTab('TPO')}
                    className={`px-3 py-1.5 rounded-md font-semibold transition cursor-pointer ${
                      activeTab === 'TPO'
                        ? 'bg-zinc-800 text-amber-400 shadow-sm border border-zinc-700'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    TPO & Market Profile
                  </button>
                  <button
                    onClick={() => setActiveTab('EQUITY')}
                    className={`px-3 py-1.5 rounded-md font-semibold transition cursor-pointer ${
                      activeTab === 'EQUITY'
                        ? 'bg-zinc-800 text-cyan-400 shadow-sm border border-zinc-700'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Equity & Drawdown
                  </button>
                </div>

                <div className="text-xs text-zinc-500 font-mono hidden sm:block">
                  Live Market Feed: XAU/USD (Spot Gold) • US100 • US500
                </div>
              </div>

              {activeTab === 'CANDLE' ? (
                <CandlestickChart
                  candles={candles}
                  trades={result ? result.trades : []}
                  symbol={symbol}
                  timeframe={timeframe}
                  selectedTrade={selectedTrade}
                  onClearSelectedTrade={() => setSelectedTrade(null)}
                  isLiveSync={isLiveSync}
                />
              ) : activeTab === 'TPO' ? (
                <TPOChart
                  candles={candles}
                  symbol={symbol}
                  timeframe={timeframe}
                />
              ) : (
                <EquityChart
                  data={result ? result.equityCurve : []}
                />
              )}
            </div>

            {/* Trade Log Journal */}
            <TradeTable
              trades={result ? result.trades : []}
              selectedTrade={selectedTrade}
              onSelectTrade={(t) => {
                setSelectedTrade(t);
                setActiveTab('CANDLE');
              }}
            />
          </div>

          {/* Right Sidebar: Strategy & Insights (1 col) */}
          <div className="flex flex-col gap-5">
            <StrategyPanel
              selectedStrategyId={selectedStrategyId}
              setSelectedStrategyId={setSelectedStrategyId}
              strategyParams={strategyParams}
              setStrategyParams={setStrategyParams}
              takeProfitPercent={takeProfitPercent}
              setTakeProfitPercent={setTakeProfitPercent}
              stopLossPercent={stopLossPercent}
              setStopLossPercent={setStopLossPercent}
              loading={loading}
            />

            {/* Strategy Tips / Quick Info Card */}
            <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4 flex flex-col gap-2.5 text-xs">
              <div className="flex items-center gap-2 text-zinc-300 font-semibold">
                <Info className="h-4 w-4 text-cyan-400" />
                <span>Architecture Guide</span>
              </div>
              <p className="text-zinc-400 leading-relaxed text-[11px]">
                To add a new strategy, simply create a new file in{' '}
                <code className="text-emerald-400 bg-zinc-950 px-1 py-0.5 rounded border border-zinc-800 font-mono">
                  src/engine/strategies
                </code>{' '}
                implementing the <code className="text-zinc-300 font-mono">Strategy</code> interface.
                It will automatically appear in this dropdown without touching the UI!
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
