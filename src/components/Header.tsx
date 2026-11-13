'use client';

import React from 'react';
import { Activity, ShieldCheck, Cpu } from 'lucide-react';

export function Header() {
  return (
    <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50 px-6 py-3.5 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
          <Activity className="h-5 w-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-base tracking-wider text-zinc-100 flex items-center gap-1.5">
              <span>ALGO</span>
              <span className="text-emerald-400 font-mono text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                STUDIO
              </span>
            </h1>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Engine Ready
            </span>
          </div>
          <p className="text-xs text-zinc-400">Quantitative Strategy Backtesting Terminal</p>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-zinc-400">
        <div className="hidden sm:flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-md">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span>Local Simulation</span>
        </div>
        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-md">
          <Cpu className="h-4 w-4 text-cyan-400" />
          <span>V8 High-Speed Engine</span>
        </div>
      </div>
    </header>
  );
}
