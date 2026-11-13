'use client';

import React, { useState } from 'react';
import { STRATEGIES } from '@/engine/strategies';
import { Sliders, Shield, Zap, ChevronDown } from 'lucide-react';

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
  const [isFallbackOpen, setIsFallbackOpen] = useState(false);
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
        <div className="flex items-center gap-2 mb-2">
          <Sliders className="h-4 w-4 text-emerald-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
            Chiến thuật & Bộ lọc
          </h2>
        </div>

        {/* Strategy Selector Dropdown */}
        <select
          value={selectedStrategyId}
          onChange={(e) => handleStrategyChange(e.target.value)}
          disabled={loading}
          className="w-full bg-zinc-950 border border-zinc-700 text-zinc-100 text-xs font-semibold rounded-lg p-2.5 focus:outline-none focus:border-emerald-500 cursor-pointer"
        >
          {STRATEGIES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-zinc-400 mt-2 leading-relaxed">
          {currentStrategy.description}
        </p>
      </div>

      {/* Dynamic Parameters based on Strategy Definition */}
      <div className="border-t border-zinc-800/80 pt-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300 mb-3">
          <Zap className="h-3.5 w-3.5 text-amber-400" />
          <span>Thông số & Bộ lọc xác nhận</span>
        </div>

        <div className="space-y-3.5">
          {currentStrategy.paramDefinitions.map((def) => {
            const val = strategyParams[def.key] ?? def.defaultValue;
            return (
              <div key={def.key} className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-300">{def.label}</span>
                  {def.type === 'number' && (
                    <span className="font-mono text-emerald-400 font-bold">{String(val)}</span>
                  )}
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

                {def.type === 'boolean' && (
                  <div className="flex items-center justify-between bg-zinc-950/60 p-2 rounded-lg border border-zinc-800/80">
                    <span className="text-[11px] text-zinc-400">
                      {Boolean(val) ? (
                        <span className="text-emerald-400 font-medium">✓ Đang kích hoạt</span>
                      ) : (
                        <span className="text-zinc-500">✕ Tắt bộ lọc</span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleParamChange(def.key, !Boolean(val))}
                      disabled={loading}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        Boolean(val) ? 'bg-emerald-500' : 'bg-zinc-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          Boolean(val) ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Global Fallback Limits (Collapsible Accordion) */}
      <div className="border-t border-zinc-800/80 pt-3">
        <button
          type="button"
          onClick={() => setIsFallbackOpen(!isFallbackOpen)}
          className="w-full flex items-center justify-between text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition cursor-pointer p-1 rounded hover:bg-zinc-800/40"
        >
          <div className="flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-zinc-500" />
            <span>Global Fallback Limits (Tùy chọn)</span>
          </div>
          <ChevronDown
            className={`w-3.5 h-3.5 text-zinc-500 transition-transform duration-200 ${
              isFallbackOpen ? 'rotate-180 text-zinc-300' : ''
            }`}
          />
        </button>

        {isFallbackOpen && (
          <div className="mt-2.5 space-y-3 pt-2 border-t border-zinc-800/40 animate-in fade-in duration-150">
            <p className="text-[10px] text-zinc-500 leading-normal">
              (Lưới an toàn dự phòng: SL/TP của chiến thuật ICT luôn được ưu tiên số 1)
            </p>

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
        )}
      </div>
    </div>
  );
}
