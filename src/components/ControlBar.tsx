'use client';

import React from 'react';
import { SUPPORTED_PAIRS } from '@/lib/market-data';
import { Timeframe } from '@/types/market';
import { Play, Loader2, DollarSign, Activity, Keyboard } from 'lucide-react';

interface ControlBarProps {
  symbol: string;
  setSymbol: (s: string) => void;
  timeframe: Timeframe;
  setTimeframe: (tf: Timeframe) => void;
  limit: number;
  setLimit: (l: number) => void;
  initialCapital: number;
  setInitialCapital: (c: number) => void;
  feePercent: number;
  setFeePercent: (f: number) => void;
  slippagePercent: number;
  setSlippagePercent: (s: number) => void;
  onRunBacktest: () => void;
  loading: boolean;
  isLiveSync: boolean;
  setIsLiveSync: (v: boolean) => void;
  onOpenIntervalDialog?: () => void;
}

const TIMEFRAMES: { label: string; value: Timeframe }[] = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1h', value: '1h' },
  { label: '4h', value: '4h' },
  { label: '1D', value: '1d' },
];

export function ControlBar({
  symbol,
  setSymbol,
  timeframe,
  setTimeframe,
  limit,
  setLimit,
  initialCapital,
  setInitialCapital,
  feePercent,
  setFeePercent,
  slippagePercent,
  setSlippagePercent,
  onRunBacktest,
  loading,
  isLiveSync,
  setIsLiveSync,
  onOpenIntervalDialog,
}: ControlBarProps) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
      {/* Left section: Symbol & Timeframe */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Symbol Selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-zinc-400">Pair:</label>
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            disabled={loading}
            className="bg-zinc-950 border border-zinc-700 text-zinc-100 text-xs font-semibold rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 transition cursor-pointer"
          >
            {SUPPORTED_PAIRS.map((pair) => (
              <option key={pair.symbol} value={pair.symbol}>
                {pair.name}
              </option>
            ))}
          </select>
        </div>

        {/* Timeframe Pills */}
        <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              onClick={() => setTimeframe(tf.value)}
              disabled={loading}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                timeframe === tf.value
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
              }`}
            >
              {tf.label}
            </button>
          ))}
          {onOpenIntervalDialog && (
            <button
              type="button"
              onClick={onOpenIntervalDialog}
              title="TradingView Hotkey: Bấm phím số bất kỳ trên bàn phím (1, 5, 15, 1h, 4h, 1d) để đổi khung nhanh"
              className="hidden lg:flex items-center gap-1 text-[11px] px-2 py-0.5 rounded text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800 transition border border-dashed border-zinc-800 cursor-pointer"
            >
              <Keyboard className="w-3 h-3 text-zinc-400" />
              <span>Gõ số (1, 5, 1h...)</span>
            </button>
          )}
        </div>

        {/* Candles limit */}
        <div className="flex items-center gap-1.5 text-xs text-zinc-400">
          <span>Dữ liệu:</span>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            disabled={loading}
            className="bg-zinc-950 border border-zinc-700 text-zinc-200 text-xs rounded-md px-2 py-1 focus:outline-none cursor-pointer font-medium"
          >
            <option value={1000}>1,000 nến</option>
            <option value={2500}>2,500 nến</option>
            <option value={5000}>5,000 nến (~8 tháng)</option>
            <option value={10000}>10,000 nến (~1.5 năm)</option>
            <option value={-1}>Toàn bộ lịch sử (Tối đa ~2 năm)</option>
          </select>
        </div>

        {/* Realtime Live Sync Toggle */}
        <button
          onClick={() => setIsLiveSync(!isLiveSync)}
          title={isLiveSync ? 'Tắt đồng bộ nến realtime' : 'Bật đồng bộ nến realtime (5s)'}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
            isLiveSync
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
              : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Activity className={`h-3.5 w-3.5 ${isLiveSync ? 'animate-pulse text-emerald-400' : ''}`} />
          <span>{isLiveSync ? 'Realtime ON' : 'Realtime OFF'}</span>
        </button>
      </div>

      {/* Middle/Right: Capital, Fee & Run Button */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Capital */}
        <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs">
          <DollarSign className="h-3.5 w-3.5 text-zinc-500" />
          <span className="text-zinc-400">Capital:</span>
          <input
            type="number"
            value={initialCapital}
            onChange={(e) => setInitialCapital(Math.max(100, Number(e.target.value)))}
            disabled={loading}
            className="w-20 bg-transparent text-zinc-100 font-mono font-medium focus:outline-none"
          />
        </div>

        {/* Fee */}
        <div className="flex items-center gap-1 text-xs text-zinc-400 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1">
          <span>Fee:</span>
          <input
            type="number"
            step="0.01"
            value={feePercent}
            onChange={(e) => setFeePercent(Number(e.target.value))}
            disabled={loading}
            className="w-12 bg-transparent text-zinc-100 font-mono font-medium focus:outline-none text-right"
          />
          <span>%</span>
        </div>

        {/* Slippage */}
        <div className="flex items-center gap-1 text-xs text-zinc-400 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1">
          <span>Slip:</span>
          <input
            type="number"
            step="0.01"
            value={slippagePercent}
            onChange={(e) => setSlippagePercent(Number(e.target.value))}
            disabled={loading}
            className="w-12 bg-transparent text-zinc-100 font-mono font-medium focus:outline-none text-right"
          />
          <span>%</span>
        </div>

        {/* Run Button */}
        <button
          onClick={onRunBacktest}
          disabled={loading}
          className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-zinc-950 font-bold text-xs px-4 py-2 rounded-lg shadow-[0_0_20px_rgba(16,185,129,0.3)] transition transform active:scale-95 disabled:opacity-50 cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Running...</span>
            </>
          ) : (
            <>
              <Play className="h-4 w-4 fill-current" />
              <span>RUN BACKTEST</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
