'use client';

import React from 'react';
import { STRATEGIES } from '@/engine/strategies';
import { Sliders, Shield, Zap } from 'lucide-react';

interface StrategyPanelProps {
  selectedStrategyId: string;
  setSelectedStrategyId: (id: string) => void;
  strategyParams: Record<string, unknown>;
  setStrategyParams: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  takeProfitPercent: number;
  setTakeProfitPercent: (v: number) => void;
  stopLossPercent: number;
  setStopLossPercent: (v: number) => void;
  loading: boolean;
}

export function StrategyPanel({
  selectedStrategyId,
  setSelectedStrategyId,
  strategyParams,
  setStrategyParams,
  takeProfitPercent,
  setTakeProfitPercent,
  stopLossPercent,
  setStopLossPercent,
  loading,
}: StrategyPanelProps) {
  const currentStrategy = STRATEGIES.find((s) => s.id === selectedStrategyId) || STRATEGIES[0];

  const handleParamChange = (key: string, value: unknown) => {
    setStrategyParams((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleStrategyChange = (id: string) => {
    setSelectedStrategyId(id);
    const target = STRATEGIES.find((s) => s.id === id);
    if (target) {
      setStrategyParams(target.defaultParams);
    }
  };

  return (
    <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-4 flex flex-col gap-4">
      {/* Strategy Header */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
            <Sliders className="h-4 w-4 text-emerald-400" />
            <span>Strategy Selector</span>
          </div>
          <span className="text-[11px] font-mono text-zinc-500 bg-zinc-800/80 px-2 py-0.5 rounded">
            {STRATEGIES.length} loaded
          </span>
        </div>

        <select
          value={selectedStrategyId}
          onChange={(e) => handleStrategyChange(e.target.value)}
          disabled={loading}
          className="w-full bg-zinc-950 border border-zinc-700 text-zinc-100 text-xs font-semibold rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500 transition cursor-pointer"
        >
          {STRATEGIES.map((strat) => (
            <option key={strat.id} value={strat.id}>
              {strat.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-zinc-400 mt-2 italic leading-relaxed">
          {currentStrategy.description}
        </p>
      </div>

      {/* Dynamic Parameters */}
      <div className="border-t border-zinc-800/80 pt-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300 mb-3">
          <Zap className="h-3.5 w-3.5 text-amber-400" />
          <span>Parameters</span>
        </div>

        <div className="space-y-3">
          {currentStrategy.paramDefinitions.map((def) => {
            const val = strategyParams[def.key] ?? def.defaultValue;
            return (
              <div key={def.key} className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-400">{def.label}</span>
                  <span className="font-mono text-emerald-400 font-medium">{String(val)}</span>
                </div>
                {def.type === 'number' && (
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={def.min ?? 1}
                      max={def.max ?? 100}
                      step={def.step ?? 1}
                      value={Number(val)}
                      onChange={(e) => handleParamChange(def.key, Number(e.target.value))}
                      disabled={loading}
                      className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                    <input
                      type="number"
                      value={Number(val)}
                      onChange={(e) => handleParamChange(def.key, Number(e.target.value))}
                      disabled={loading}
                      className="w-14 bg-zinc-950 border border-zinc-700 text-zinc-200 text-xs font-mono rounded px-1.5 py-0.5 text-center focus:outline-none"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Risk Management (TP & SL) */}
      <div className="border-t border-zinc-800/80 pt-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300 mb-1">
          <Shield className="h-3.5 w-3.5 text-cyan-400" />
          <span>Global Fallback Limits (Optional)</span>
        </div>
        <p className="text-[10px] text-zinc-500 mb-3">
          (Mặc định SL đã được chốt tại râu nến quét và TP theo tỉ lệ R:R của chiến thuật)
        </p>

        <div className="space-y-3">
          {/* Take Profit */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-400">Take Profit (% target)</span>
              <span className="font-mono text-emerald-400 font-medium">+{takeProfitPercent}%</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={50}
                step={0.5}
                value={takeProfitPercent}
                onChange={(e) => setTakeProfitPercent(Number(e.target.value))}
                disabled={loading}
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
              <span className="text-[11px] text-zinc-500 font-mono w-14 text-center">
                {takeProfitPercent === 0 ? 'Off' : `${takeProfitPercent}%`}
              </span>
            </div>
          </div>

          {/* Stop Loss */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-400">Stop Loss (% limit)</span>
              <span className="font-mono text-rose-400 font-medium">-{stopLossPercent}%</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={30}
                step={0.5}
                value={stopLossPercent}
                onChange={(e) => setStopLossPercent(Number(e.target.value))}
                disabled={loading}
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
              />
              <span className="text-[11px] text-zinc-500 font-mono w-14 text-center">
                {stopLossPercent === 0 ? 'Off' : `-${stopLossPercent}%`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
