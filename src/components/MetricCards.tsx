'use client';

import React from 'react';
import { BacktestMetrics } from '@/types/backtest';
import { formatCurrency, formatPercent } from '@/lib/utils';
import { TrendingUp, TrendingDown, Target, ShieldAlert, Award, Layers } from 'lucide-react';

interface MetricCardsProps {
  metrics: BacktestMetrics | null;
  loading?: boolean;
}

export function MetricCards({ metrics, loading }: MetricCardsProps) {
  if (loading || !metrics) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-xl bg-zinc-900/60 border border-zinc-800/80 animate-pulse"
          />
        ))}
      </div>
    );
  }

  const isProfit = metrics.netProfit >= 0;
  const isHealthyPF = metrics.profitFactor >= 1.5;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {/* 1. Net Profit */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col justify-between hover:border-zinc-700 transition">
        <div className="flex items-center justify-between text-zinc-400 text-xs font-medium">
          <span>Net Profit</span>
          {isProfit ? (
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          ) : (
            <TrendingDown className="h-4 w-4 text-rose-400" />
          )}
        </div>
        <div className="mt-2">
          <div
            className={`text-lg font-bold tracking-tight font-mono ${
              isProfit ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {formatPercent(metrics.netProfitPercent)}
          </div>
          <div className="text-xs text-zinc-400 mt-0.5">
            {formatCurrency(metrics.netProfit)}
          </div>
        </div>
      </div>

      {/* 2. Win Rate */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col justify-between hover:border-zinc-700 transition">
        <div className="flex items-center justify-between text-zinc-400 text-xs font-medium">
          <span>Win Rate</span>
          <Target className="h-4 w-4 text-cyan-400" />
        </div>
        <div className="mt-2">
          <div className="text-lg font-bold tracking-tight text-zinc-100 font-mono">
            {metrics.winRate.toFixed(1)}%
          </div>
          <div className="text-xs text-zinc-400 mt-0.5 flex gap-1">
            <span className="text-emerald-400">{metrics.winningTrades}W</span>
            <span>/</span>
            <span className="text-rose-400">{metrics.losingTrades}L</span>
          </div>
        </div>
      </div>

      {/* 3. Profit Factor */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col justify-between hover:border-zinc-700 transition">
        <div className="flex items-center justify-between text-zinc-400 text-xs font-medium">
          <span>Profit Factor</span>
          <Award className={`h-4 w-4 ${isHealthyPF ? 'text-emerald-400' : 'text-amber-400'}`} />
        </div>
        <div className="mt-2">
          <div
            className={`text-lg font-bold tracking-tight font-mono ${
              isHealthyPF ? 'text-emerald-400' : 'text-zinc-100'
            }`}
          >
            {metrics.profitFactor >= 99 ? '∞' : metrics.profitFactor.toFixed(2)}
          </div>
          <div className="text-xs text-zinc-400 mt-0.5">
            {metrics.profitFactor > 1.5 ? 'Strong edge' : 'Break-even / Weak'}
          </div>
        </div>
      </div>

      {/* 4. Max Drawdown */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col justify-between hover:border-zinc-700 transition">
        <div className="flex items-center justify-between text-zinc-400 text-xs font-medium">
          <span>Max Drawdown</span>
          <ShieldAlert className="h-4 w-4 text-rose-400" />
        </div>
        <div className="mt-2">
          <div className="text-lg font-bold tracking-tight text-rose-400 font-mono">
            -{metrics.maxDrawdownPercent.toFixed(2)}%
          </div>
          <div className="text-xs text-zinc-400 mt-0.5">
            -{formatCurrency(metrics.maxDrawdownDollar)}
          </div>
        </div>
      </div>

      {/* 5. Sharpe Ratio */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col justify-between hover:border-zinc-700 transition">
        <div className="flex items-center justify-between text-zinc-400 text-xs font-medium">
          <span>Sharpe Ratio</span>
          <Layers className="h-4 w-4 text-indigo-400" />
        </div>
        <div className="mt-2">
          <div className="text-lg font-bold tracking-tight text-zinc-100 font-mono">
            {metrics.sharpeRatio.toFixed(2)}
          </div>
          <div className="text-xs text-zinc-400 mt-0.5">
            {metrics.totalTrades} total trades
          </div>
        </div>
      </div>

      {/* 6. Benchmark (Buy & Hold) */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col justify-between hover:border-zinc-700 transition">
        <div className="flex items-center justify-between text-zinc-400 text-xs font-medium">
          <span>vs Buy & Hold</span>
          <span className="text-[10px] uppercase font-mono px-1 py-0.5 bg-zinc-800 rounded text-zinc-400">
            Bench
          </span>
        </div>
        <div className="mt-2">
          <div
            className={`text-lg font-bold tracking-tight font-mono ${
              metrics.buyAndHoldReturnPercent >= 0 ? 'text-zinc-200' : 'text-rose-400'
            }`}
          >
            {formatPercent(metrics.buyAndHoldReturnPercent)}
          </div>
          <div className="text-xs mt-0.5 text-zinc-400">
            Alpha:{' '}
            <span
              className={
                metrics.netProfitPercent > metrics.buyAndHoldReturnPercent
                  ? 'text-emerald-400 font-medium'
                  : 'text-zinc-400'
              }
            >
              {formatPercent(metrics.netProfitPercent - metrics.buyAndHoldReturnPercent)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
