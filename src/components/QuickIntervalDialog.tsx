'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Timeframe } from '@/types/market';
import { Clock, CornerDownLeft, X, Keyboard, Check } from 'lucide-react';

export interface ParsedInterval {
  timeframe: Timeframe | null;
  label: string;
  unit: string;
  isValid: boolean;
}

export function parseIntervalInput(input: string): ParsedInterval {
  const raw = input.trim().toLowerCase();
  if (!raw) {
    return {
      timeframe: null,
      label: 'Gõ số phút (1, 5, 15) hoặc kèm chữ (1h, 4h, 1d)...',
      unit: '',
      isValid: false,
    };
  }

  // 1. Direct number input (TradingView convention: pure number = minutes)
  if (/^\d+$/.test(raw)) {
    const num = parseInt(raw, 10);
    if (num === 1) {
      return { timeframe: '1m', label: '1 phút (1m)', unit: 'Phút', isValid: true };
    }
    if (num === 5) {
      return { timeframe: '5m', label: '5 phút (5m)', unit: 'Phút', isValid: true };
    }
    if (num === 15) {
      return { timeframe: '15m', label: '15 phút (15m)', unit: 'Phút', isValid: true };
    }
    if (num === 60) {
      return { timeframe: '1h', label: '1 giờ (60 phút)', unit: 'Giờ', isValid: true };
    }
    if (num === 240) {
      return { timeframe: '4h', label: '4 giờ (240 phút)', unit: 'Giờ', isValid: true };
    }
    if (num === 1440) {
      return { timeframe: '1d', label: '1 ngày (1440 phút)', unit: 'Ngày', isValid: true };
    }
    // Proximity matching
    if (num < 3) return { timeframe: '1m', label: '1 phút (1m)', unit: 'Phút', isValid: true };
    if (num <= 10) return { timeframe: '5m', label: '5 phút (5m)', unit: 'Phút', isValid: true };
    if (num <= 30) return { timeframe: '15m', label: '15 phút (15m)', unit: 'Phút', isValid: true };
    if (num <= 120) return { timeframe: '1h', label: '1 giờ (1h)', unit: 'Giờ', isValid: true };
    if (num <= 480) return { timeframe: '4h', label: '4 giờ (4h)', unit: 'Giờ', isValid: true };
    return { timeframe: '1d', label: '1 ngày (1D)', unit: 'Ngày', isValid: true };
  }

  // 2. Specific patterns with units
  if (/^(1m|m1|1min)$/.test(raw)) {
    return { timeframe: '1m', label: '1 phút (1m)', unit: 'Phút', isValid: true };
  }
  if (/^(5m|m5|5min)$/.test(raw)) {
    return { timeframe: '5m', label: '5 phút (5m)', unit: 'Phút', isValid: true };
  }
  if (/^(15m|m15|15min)$/.test(raw)) {
    return { timeframe: '15m', label: '15 phút (15m)', unit: 'Phút', isValid: true };
  }
  if (/^(1h|h1|h|60m)$/.test(raw)) {
    return { timeframe: '1h', label: '1 giờ (1h)', unit: 'Giờ', isValid: true };
  }
  if (/^(4h|h4|240m)$/.test(raw)) {
    return { timeframe: '4h', label: '4 giờ (4h)', unit: 'Giờ', isValid: true };
  }
  if (/^(1d|d1|d|day)$/.test(raw)) {
    return { timeframe: '1d', label: '1 ngày (1D)', unit: 'Ngày', isValid: true };
  }

  return {
    timeframe: null,
    label: `Khung "${input}" không hỗ trợ. Hỗ trợ: 1, 5, 15, 1h, 4h, 1d`,
    unit: '',
    isValid: false,
  };
}

const PRESET_TIMEFRAMES: { label: string; value: Timeframe; shortcut: string }[] = [
  { label: '1m', value: '1m', shortcut: '1' },
  { label: '5m', value: '5m', shortcut: '5' },
  { label: '15m', value: '15m', shortcut: '15' },
  { label: '1h', value: '1h', shortcut: '1h' },
  { label: '4h', value: '4h', shortcut: '4h' },
  { label: '1D', value: '1d', shortcut: '1d' },
];

interface QuickIntervalDialogProps {
  currentTimeframe: Timeframe;
  onSelectTimeframe: (tf: Timeframe) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export function QuickIntervalDialog({
  currentTimeframe,
  onSelectTimeframe,
  isOpen,
  setIsOpen,
}: QuickIntervalDialogProps) {
  const [inputVal, setInputVal] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  const parsed = parseIntervalInput(inputVal);

  const handleApply = useCallback(() => {
    if (parsed.isValid && parsed.timeframe) {
      onSelectTimeframe(parsed.timeframe);
      setIsOpen(false);
      setInputVal('');
    }
  }, [parsed, onSelectTimeframe, setIsOpen]);

  // Global keydown listener to trigger dialog when user types numbers or time letters anywhere on chart
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Do nothing if user is in an input, textarea, or select element
      const activeEl = document.activeElement;
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl instanceof HTMLSelectElement ||
        (activeEl as HTMLElement)?.isContentEditable;

      if (isInput) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      // When dialog is closed: open if typing 0-9, h, d, m, or comma (TradingView interval key)
      if (!isOpen) {
        if (/^[0-9hdDmM,]$/.test(e.key)) {
          e.preventDefault();
          const initial = e.key === ',' ? '' : e.key;
          setInputVal(initial);
          setIsOpen(true);
        }
      } else {
        // When dialog is already open
        if (e.key === 'Escape') {
          e.preventDefault();
          setIsOpen(false);
          setInputVal('');
        } else if (e.key === 'Enter') {
          e.preventDefault();
          handleApply();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen, handleApply, setIsOpen]);

  // Auto focus and select input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.setSelectionRange(inputVal.length, inputVal.length);
        }
      }, 50);
    }
  }, [isOpen, inputVal.length]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setIsOpen(false);
          setInputVal('');
        }
      }}
    >
      <div className="bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden text-zinc-100 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950/40">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-semibold tracking-wider uppercase text-zinc-300">
              Đổi khung thời gian (Interval)
            </h3>
          </div>
          <button
            onClick={() => {
              setIsOpen(false);
              setInputVal('');
            }}
            className="text-zinc-500 hover:text-zinc-200 transition p-1 rounded-md hover:bg-zinc-800"
            title="Đóng (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3.5">
          {/* Main Input */}
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="1, 5, 1h, 4h, 1d..."
              className="w-full bg-zinc-950 border border-zinc-700 text-zinc-100 text-2xl font-mono font-bold tracking-wider rounded-xl px-4 py-3 text-center focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition uppercase placeholder:text-zinc-600 placeholder:text-base placeholder:font-normal"
            />
            {inputVal && (
              <button
                type="button"
                onClick={() => setInputVal('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Realtime interpretation badge */}
          <div className="min-h-[28px] flex items-center justify-center">
            {parsed.isValid ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-semibold animate-in fade-in duration-100">
                <Check className="w-3.5 h-3.5" />
                <span>{parsed.label}</span>
                <span className="text-emerald-500/70 font-normal ml-1">— Bấm Enter ↵</span>
              </div>
            ) : (
              <p className="text-[11px] text-zinc-500 text-center">
                {inputVal ? (
                  <span className="text-amber-400/90">{parsed.label}</span>
                ) : (
                  'Gõ số trên bàn phím (1 = 1m, 5 = 5m, 1h = 1h...)'
                )}
              </p>
            )}
          </div>

          {/* Quick preset chips */}
          <div>
            <div className="text-[11px] font-medium text-zinc-400 mb-1.5 flex items-center justify-between">
              <span>Khung thời gian phổ biến:</span>
              <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                <Keyboard className="w-3 h-3" /> Phím tắt
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {PRESET_TIMEFRAMES.map((preset) => {
                const isSelected = currentTimeframe === preset.value;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => {
                      onSelectTimeframe(preset.value);
                      setIsOpen(false);
                      setInputVal('');
                    }}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 ring-1 ring-emerald-500/30'
                        : 'bg-zinc-950/60 hover:bg-zinc-800 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <span>{preset.label}</span>
                    <span className="text-[10px] text-zinc-500 font-mono font-normal bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                      {preset.shortcut}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 bg-zinc-950/60 border-t border-zinc-800 text-xs">
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              setInputVal('');
            }}
            className="px-3 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
          >
            Huỷ (Esc)
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!parsed.isValid}
            className={`inline-flex items-center gap-1 px-4 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
              parsed.isValid
                ? 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-md shadow-emerald-500/20'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            }`}
          >
            <span>Áp dụng</span>
            <CornerDownLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
