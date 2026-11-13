'use client';

import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { EquityPoint } from '@/types/backtest';
import { formatCurrency } from '@/lib/utils';
import { LineChart, ArrowDownRight } from 'lucide-react';

interface EquityChartProps {
  data: EquityPoint[];
}

export function EquityChart({ data }: EquityChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-zinc-500 text-xs font-mono">
        No equity curve data available.
      </div>
    );
  }

  // Sample data points if too large for smooth SVG rendering (up to 300 points)
  const step = Math.max(1, Math.floor(data.length / 300));
  const sampledData = data
    .filter((_, idx) => idx % step === 0 || idx === data.length - 1)
    .map((pt) => ({
      ...pt,
      formattedDate: new Date(pt.time * 1000).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
    }));

  return (
    <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-4 flex flex-col gap-6">
      {/* 1. Equity Curve vs Benchmark */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <LineChart className="h-4 w-4 text-emerald-400" />
            <h3 className="text-xs font-semibold text-zinc-200">Portfolio Equity Curve</h3>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-zinc-400 text-[11px]">Strategy</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-zinc-500" />
              <span className="text-zinc-400 text-[11px]">Buy & Hold</span>
            </div>
          </div>
        </div>

        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sampledData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="benchmarkGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#71717a" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#71717a" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="formattedDate"
                stroke="#71717a"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#71717a"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                domain={['auto', 'auto']}
                tickFormatter={(val) => `$${(val / 1000).toFixed(1)}k`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0].payload as EquityPoint & { formattedDate: string };
                    return (
                      <div className="bg-zinc-950/95 border border-zinc-800 p-2.5 rounded-lg shadow-xl text-xs font-mono space-y-1">
                        <div className="text-zinc-400">{item.formattedDate}</div>
                        <div className="text-emerald-400 font-bold">
                          Strategy: {formatCurrency(item.equity)}
                        </div>
                        <div className="text-zinc-400">
                          Buy & Hold: {formatCurrency(item.benchmarkEquity)}
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="benchmarkEquity"
                stroke="#71717a"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                fill="url(#benchmarkGradient)"
              />
              <Area
                type="monotone"
                dataKey="equity"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#equityGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 2. Underwater Drawdown */}
      <div className="border-t border-zinc-800/80 pt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ArrowDownRight className="h-4 w-4 text-rose-400" />
            <h4 className="text-xs font-semibold text-zinc-300">Underwater Drawdown</h4>
          </div>
          <span className="text-[11px] text-zinc-500 font-mono">% from peak equity</span>
        </div>

        <div className="h-28 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sampledData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.05} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.35} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="formattedDate" hide />
              <YAxis
                stroke="#71717a"
                fontSize={9}
                tickLine={false}
                axisLine={false}
                domain={[-100, 0]}
                tickFormatter={(val) => `${val}%`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0].payload as EquityPoint & { formattedDate: string };
                    return (
                      <div className="bg-zinc-950/95 border border-zinc-800 p-2 rounded shadow-xl text-xs font-mono">
                        <div className="text-rose-400 font-bold">
                          Drawdown: -{item.drawdownPercent.toFixed(2)}%
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey={(d) => -d.drawdownPercent}
                stroke="#ef4444"
                strokeWidth={1.5}
                fill="url(#drawdownGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
