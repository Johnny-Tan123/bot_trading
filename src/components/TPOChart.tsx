'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Candle } from '@/types/market';
import { calculateTPOProfile, TPOSession, TPOPriceLevel } from '@/engine/tpo-profile';
import {
  Calendar,
  Layers,
  Activity,
  AlertTriangle,
  Zap,
  Split,
  Maximize2,
  Minimize2,
  BarChart2,
  HelpCircle,
} from 'lucide-react';

interface TPOChartProps {
  candles: Candle[];
  symbol: string;
  timeframe: string;
}

// TradingView Time Heatmap Gradient Palette by Period Letter
const PERIOD_COLORS: Record<string, { bg: string; text: string }> = {
  A: { bg: '#2563eb', text: '#ffffff' }, // Royal Blue
  B: { bg: '#3b82f6', text: '#ffffff' }, // Blue
  C: { bg: '#0284c7', text: '#ffffff' }, // Sky
  D: { bg: '#06b6d4', text: '#ffffff' }, // Cyan
  E: { bg: '#0d9488', text: '#ffffff' }, // Teal
  F: { bg: '#10b981', text: '#ffffff' }, // Emerald
  G: { bg: '#65a30d', text: '#ffffff' }, // Lime
  H: { bg: '#ca8a04', text: '#ffffff' }, // Yellow
  I: { bg: '#d97706', text: '#ffffff' }, // Amber
  J: { bg: '#ea580c', text: '#ffffff' }, // Orange
  K: { bg: '#dc2626', text: '#ffffff' }, // Red
  L: { bg: '#e11d48', text: '#ffffff' }, // Rose
  M: { bg: '#c026d3', text: '#ffffff' }, // Fuchsia
  N: { bg: '#9333ea', text: '#ffffff' }, // Purple
  O: { bg: '#7c3aed', text: '#ffffff' }, // Violet
  P: { bg: '#4f46e5', text: '#ffffff' }, // Indigo
};

function getPeriodColor(letter: string) {
  return PERIOD_COLORS[letter] || { bg: '#475569', text: '#f1f5f9' };
}

export function TPOChart({ candles, symbol, timeframe }: TPOChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [viewMode, setViewMode] = useState<'COLLAPSED' | 'SPLIT'>('COLLAPSED');
  const [showVolumeSide, setShowVolumeSide] = useState<boolean>(true);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [hoveredLevel, setHoveredLevel] = useState<TPOPriceLevel | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Close fullscreen on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  // Compute TPO profiles
  const tpoResult = useMemo(() => {
    return calculateTPOProfile(candles, 42);
  }, [candles]);

  const { sessions, activeSession } = tpoResult;

  const currentSession: TPOSession | null = useMemo(() => {
    if (!sessions || sessions.length === 0) return null;
    if (selectedSessionId) {
      return sessions.find((s) => s.sessionId === selectedSessionId) || activeSession;
    }
    return activeSession || sessions[sessions.length - 1];
  }, [sessions, selectedSessionId, activeSession]);

  // Render TradingView-style Graphic Canvas
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !currentSession) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = container.clientWidth || 800;
    const height = Math.max(520, container.clientHeight || 520);
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, width, height);

    const levels = currentSession.levels;
    const numLevels = levels.length;
    if (numLevels === 0) {
      ctx.restore();
      return;
    }

    const priceAxisWidth = 75;
    const leftMargin = 30; // space for Initial Balance bracket
    const chartWidth = width - priceAxisWidth - leftMargin;

    const paddingTop = 30;
    const paddingBottom = 30;
    const drawHeight = height - paddingTop - paddingBottom;
    const rowHeight = Math.max(8, drawHeight / numLevels);

    // Reverse: index 0 (lowest) at bottom, index numLevels-1 (highest) at top
    const maxTpos = Math.max(1, ...levels.map((l) => l.tpoCount));
    const maxVol = Math.max(1, ...levels.map((l) => l.volume));

    // Volume Profile column width on the right (if enabled)
    const vpColWidth = showVolumeSide ? Math.min(140, chartWidth * 0.28) : 0;
    const tpoAreaWidth = chartWidth - vpColWidth - 20;

    // 1. Draw Value Area Background Shading (VAL to VAH)
    const valLevelIdx = levels.findIndex((l) => l.priceLow <= currentSession.val);
    const vahLevelIdx = levels.findIndex((l) => l.priceHigh >= currentSession.vah);

    const safeValIdx = valLevelIdx >= 0 ? valLevelIdx : 0;
    const safeVahIdx = vahLevelIdx >= 0 ? vahLevelIdx : numLevels - 1;

    const yVAH = paddingTop + (numLevels - 1 - safeVahIdx) * rowHeight;
    const yVAL = paddingTop + (numLevels - safeValIdx) * rowHeight;
    const vaHeight = Math.max(4, yVAL - yVAH);

    ctx.fillStyle = 'rgba(14, 165, 233, 0.07)';
    ctx.fillRect(leftMargin, yVAH, chartWidth, vaHeight);

    // VAH & VAL lines
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);

    ctx.beginPath();
    ctx.moveTo(leftMargin, yVAH);
    ctx.lineTo(leftMargin + chartWidth, yVAH);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(leftMargin, yVAL);
    ctx.lineTo(leftMargin + chartWidth, yVAL);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Draw Initial Balance (IB) Bracket [ on the left margin
    const ibLowIdx = levels.findIndex((l) => l.priceLow <= currentSession.ibLow);
    const ibHighIdx = levels.findIndex((l) => l.priceHigh >= currentSession.ibHigh);

    const safeIbLow = ibLowIdx >= 0 ? ibLowIdx : 0;
    const safeIbHigh = ibHighIdx >= 0 ? ibHighIdx : Math.min(numLevels - 1, safeIbLow + 5);

    const yIBTop = paddingTop + (numLevels - 1 - safeIbHigh) * rowHeight;
    const yIBBottom = paddingTop + (numLevels - safeIbLow) * rowHeight;

    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    // [ bracket
    ctx.moveTo(leftMargin - 8, yIBTop);
    ctx.lineTo(leftMargin - 16, yIBTop);
    ctx.lineTo(leftMargin - 16, yIBBottom);
    ctx.lineTo(leftMargin - 8, yIBBottom);
    ctx.stroke();

    // IB Label
    ctx.fillStyle = '#06b6d4';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('IB', leftMargin - 18, (yIBTop + yIBBottom) / 2);

    // 3. Draw TPO Letters (Collapsed or Split) & Rows
    const letterWidth = Math.min(18, Math.max(10, rowHeight * 1.05));
    const letterFont = `bold ${Math.max(8, Math.min(12, rowHeight * 0.85))}px monospace`;

    levels.forEach((lvl, lvlIdx) => {
      const rowY = paddingTop + (numLevels - 1 - lvlIdx) * rowHeight;
      const isTPOC = lvl.isTPOC;
      const isSinglePrint = lvl.isSinglePrint;

      // Subtle horizontal grid line
      ctx.strokeStyle = 'rgba(39, 39, 42, 0.4)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(leftMargin, rowY + rowHeight);
      ctx.lineTo(leftMargin + chartWidth, rowY + rowHeight);
      ctx.stroke();

      // Highlight TPOC Row background
      if (isTPOC) {
        ctx.fillStyle = 'rgba(239, 83, 80, 0.12)';
        ctx.fillRect(leftMargin, rowY, chartWidth, rowHeight);
      }

      // Draw TPO Letters
      lvl.letters.forEach((letter, letterIdx) => {
        let letterX = leftMargin + 4;
        if (viewMode === 'COLLAPSED') {
          letterX += letterIdx * (letterWidth + 1);
        } else {
          // Split mode: letter column based on its character code
          const charCode = letter.charCodeAt(0);
          const colOffset =
            charCode >= 65 && charCode <= 90 ? charCode - 65 : charCode - 97 + 26;
          letterX += colOffset * (letterWidth + 2);
        }

        const color = getPeriodColor(letter);

        // Letter Tile Box
        ctx.fillStyle = isTPOC ? '#ef4444' : color.bg;
        ctx.fillRect(letterX, rowY + 1, letterWidth, rowHeight - 2);

        // Letter Character
        ctx.fillStyle = '#ffffff';
        ctx.font = letterFont;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letter, letterX + letterWidth / 2, rowY + rowHeight / 2);
      });

      // Single Print indicator
      if (isSinglePrint) {
        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('⚡ Single', leftMargin + tpoAreaWidth - 65, rowY + rowHeight / 2);
      }

      // 4. Draw Session Volume Profile on the right (if enabled)
      if (showVolumeSide) {
        const vpStartX = leftMargin + tpoAreaWidth + 10;
        const totalBarW = (lvl.volume / maxVol) * vpColWidth;
        const buyW = totalBarW * 0.58;
        const sellW = totalBarW - buyW;

        const inVA = lvl.isValueArea;
        const buyColor = inVA ? '#26a69a' : 'rgba(38, 166, 154, 0.35)';
        const sellColor = inVA ? '#ef5350' : 'rgba(239, 83, 80, 0.35)';

        // Buy (Green)
        ctx.fillStyle = buyColor;
        ctx.fillRect(vpStartX, rowY + 1, buyW, rowHeight - 2);

        // Sell (Red)
        ctx.fillStyle = sellColor;
        ctx.fillRect(vpStartX + buyW, rowY + 1, sellW, rowHeight - 2);
      }

      // 5. Price Axis Label (Right column)
      const axisX = width - priceAxisWidth + 8;
      ctx.fillStyle = isTPOC ? '#ef4444' : lvl.isValueArea ? '#e4e4e7' : '#71717a';
      ctx.font = `${isTPOC ? 'bold' : 'normal'} 10px monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`$${lvl.price.toFixed(1)}`, axisX, rowY + rowHeight / 2);
    });

    // 5. Draw Red Point of Control (POC) Line across the screen
    const tpocIdx = levels.findIndex((l) => l.isTPOC);
    if (tpocIdx >= 0) {
      const yPOC = paddingTop + (numLevels - 1 - tpocIdx) * rowHeight + rowHeight / 2;

      ctx.save();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(leftMargin, yPOC);
      ctx.lineTo(width - priceAxisWidth, yPOC);
      ctx.stroke();

      // Red POC Price badge on right axis
      const badgeW = 68;
      const badgeH = 16;
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(width - priceAxisWidth + 2, yPOC - badgeH / 2, badgeW, badgeH);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`POC ${currentSession.tpocPrice.toFixed(1)}`, width - priceAxisWidth + 2 + badgeW / 2, yPOC);
      ctx.restore();
    }

    // 6. Draw Poor High / Poor Low Badges if present
    if (currentSession.hasPoorHigh) {
      const yTop = paddingTop + 10;
      ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
      ctx.fillRect(leftMargin + 10, yTop - 8, 120, 15);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8.5px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('⚠️ POOR HIGH (BSL)', leftMargin + 70, yTop);
    }

    if (currentSession.hasPoorLow) {
      const yBot = height - paddingBottom - 10;
      ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
      ctx.fillRect(leftMargin + 10, yBot - 8, 120, 15);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8.5px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('⚠️ POOR LOW (SSL)', leftMargin + 70, yBot);
    }

    ctx.restore();
  }, [currentSession, viewMode, showVolumeSide]);

  // Handle canvas mouse move for interactive level inspection
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !currentSession) return;

    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = canvas.clientHeight;
    const paddingTop = 30;
    const paddingBottom = 30;
    const drawHeight = height - paddingTop - paddingBottom;
    const numLevels = currentSession.levels.length;
    const rowHeight = drawHeight / numLevels;

    if (y < paddingTop || y > height - paddingBottom) {
      setHoveredLevel(null);
      return;
    }

    const rowIdx = Math.floor((y - paddingTop) / rowHeight);
    const levelIdx = numLevels - 1 - rowIdx;

    if (levelIdx >= 0 && levelIdx < numLevels) {
      setHoveredLevel(currentSession.levels[levelIdx]);
    } else {
      setHoveredLevel(null);
    }
  };

  const handleMouseLeave = () => {
    setHoveredLevel(null);
  };

  useEffect(() => {
    renderCanvas();
    const handleResize = () => renderCanvas();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderCanvas]);

  // Trigger redraw on resize / fullscreen
  useEffect(() => {
    const timer = setTimeout(() => {
      renderCanvas();
    }, 60);
    return () => clearTimeout(timer);
  }, [isFullscreen, renderCanvas]);

  if (!currentSession) {
    return null;
  }

  return (
    <div
      className={`transition-all duration-200 flex flex-col ${
        isFullscreen
          ? 'fixed inset-0 z-50 bg-zinc-950 p-2 sm:p-4 w-screen h-screen'
          : 'bg-zinc-900/70 border border-zinc-800 rounded-xl overflow-hidden'
      }`}
    >
      {/* Top Controls Bar */}
      <div className="px-4 py-3 border-b border-zinc-800/80 bg-zinc-950/60 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Symbol & Session Picker */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-amber-400" />
            <span className="font-bold text-xs text-zinc-100 font-mono tracking-wider">
              {symbol} • TPO PERIODIC PROFILE
            </span>
            <span className="text-[11px] text-zinc-500 font-mono">
              ({timeframe.toUpperCase()})
            </span>
          </div>

          {/* Session Picker */}
          <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-700/80 rounded-lg px-2.5 py-1 text-xs">
            <Calendar className="h-3.5 w-3.5 text-zinc-400" />
            <select
              value={currentSession.sessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="bg-transparent text-zinc-200 text-xs font-mono font-medium focus:outline-none cursor-pointer"
            >
              {sessions.map((s) => (
                <option key={s.sessionId} value={s.sessionId} className="bg-zinc-950 text-zinc-200">
                  Phiên {s.date} (High: ${s.high} | Low: ${s.low})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right: Collapsed vs Split & Volume toggle & Fullscreen */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Volume Profile side bar toggle */}
          <button
            onClick={() => setShowVolumeSide(!showVolumeSide)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border transition cursor-pointer ${
              showVolumeSide
                ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
                : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <BarChart2 className="h-3.5 w-3.5" />
            <span>Dual Volume Profile</span>
          </button>

          {/* View Mode: Collapsed vs Split */}
          <div className="flex items-center bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs">
            <button
              onClick={() => setViewMode('COLLAPSED')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded font-medium transition cursor-pointer ${
                viewMode === 'COLLAPSED'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Dồn Profile thành hình quả chuông chuẩn TradingView"
            >
              <Layers className="h-3 w-3" />
              <span>Collapsed</span>
            </button>
            <button
              onClick={() => setViewMode('SPLIT')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded font-medium transition cursor-pointer ${
                viewMode === 'SPLIT'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Tách các block chữ cái A-Z theo timeline ngang"
            >
              <Split className="h-3 w-3" />
              <span>Split (Timeline)</span>
            </button>
          </div>

          {/* Fullscreen Maximize / Minimize Button */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border transition cursor-pointer ${
              isFullscreen
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-900'
            }`}
            title={isFullscreen ? 'Thu nhỏ (Phím ESC)' : 'Phóng to toàn màn hình'}
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5 text-amber-400" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5 text-zinc-400" />
            )}
            <span>{isFullscreen ? 'Thu nhỏ' : 'Phóng to'}</span>
          </button>
        </div>
      </div>

      {/* TradingView-Style Session HUD */}
      <div className="px-4 py-2.5 bg-zinc-950/40 border-b border-zinc-800/60 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs font-mono">
        {/* POC */}
        <div className="flex flex-col bg-zinc-900/50 p-2 rounded-lg border border-zinc-800/80">
          <span className="text-[10px] text-zinc-500 uppercase flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-rose-500" />
            POC (Point of Control)
          </span>
          <span className="text-rose-400 font-bold text-xs mt-0.5">
            ${currentSession.tpocPrice}
          </span>
          <span className="text-[10px] text-zinc-400">({currentSession.tpocCount} TPOs)</span>
        </div>

        {/* Value Area (70%) */}
        <div className="flex flex-col bg-zinc-900/50 p-2 rounded-lg border border-zinc-800/80">
          <span className="text-[10px] text-zinc-500 uppercase flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-sky-400" />
            Value Area (70%)
          </span>
          <span className="text-sky-300 font-bold text-xs mt-0.5">
            ${currentSession.val} - ${currentSession.vah}
          </span>
          <span className="text-[10px] text-sky-400">
            Spread: ${(currentSession.vah - currentSession.val).toFixed(1)}
          </span>
        </div>

        {/* Initial Balance (IB) */}
        <div className="flex flex-col bg-zinc-900/50 p-2 rounded-lg border border-zinc-800/80">
          <span className="text-[10px] text-zinc-500 uppercase flex items-center gap-1">
            <span className="text-cyan-400 font-bold">[ IB ]</span>
            Initial Balance
          </span>
          <span className="text-zinc-100 font-bold text-xs mt-0.5">
            ${currentSession.ibLow} - ${currentSession.ibHigh}
          </span>
          <span className="text-[10px] text-cyan-400">Range: ${currentSession.ibRange}</span>
        </div>

        {/* Profile Structure */}
        <div className="flex flex-col bg-zinc-900/50 p-2 rounded-lg border border-zinc-800/80">
          <span className="text-[10px] text-zinc-500 uppercase flex items-center gap-1">
            <Activity className="h-3 w-3 text-purple-400" />
            Profile Shape
          </span>
          <span className="text-purple-300 font-bold text-xs mt-0.5">
            {currentSession.profileType}
          </span>
          <span className="text-[10px] text-zinc-500">
            {currentSession.profileType === 'NORMAL' && 'Bell Curve'}
            {currentSession.profileType === 'TREND' && 'Trend Day'}
            {currentSession.profileType === 'P_SHAPE' && 'P-Shape (Buyers)'}
            {currentSession.profileType === 'B_SHAPE' && 'b-Shape (Sellers)'}
            {currentSession.profileType === 'DOUBLE_DISTRIBUTION' && '2 Value Areas'}
          </span>
        </div>

        {/* Poor Extremes */}
        <div className="flex flex-col bg-zinc-900/50 p-2 rounded-lg border border-zinc-800/80">
          <span className="text-[10px] text-zinc-500 uppercase flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-rose-400" />
            Đấu giá hụt (Poor)
          </span>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {currentSession.hasPoorHigh && (
              <span className="bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[9px] px-1 py-0.5 rounded">
                Poor High (BSL)
              </span>
            )}
            {currentSession.hasPoorLow && (
              <span className="bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[9px] px-1 py-0.5 rounded">
                Poor Low (SSL)
              </span>
            )}
            {!currentSession.hasPoorHigh && !currentSession.hasPoorLow && (
              <span className="text-zinc-400 text-xs">Excess Tail (Chuẩn)</span>
            )}
          </div>
        </div>

        {/* Single Prints */}
        <div className="flex flex-col bg-zinc-900/50 p-2 rounded-lg border border-zinc-800/80">
          <span className="text-[10px] text-zinc-500 uppercase flex items-center gap-1">
            <Zap className="h-3 w-3 text-amber-400" />
            Single Prints (FVG)
          </span>
          <span className="text-zinc-100 font-bold text-xs mt-0.5">
            {currentSession.singlePrints.length > 0
              ? `${currentSession.singlePrints.length} levels`
              : 'None'}
          </span>
          <span className="text-[10px] text-amber-400">
            {currentSession.singlePrints.length > 0 ? 'Có Imbalance chạy nhanh' : 'Không có gap'}
          </span>
        </div>
      </div>

      {/* Main Interactive Graphical Canvas */}
      <div
        ref={containerRef}
        className={`relative w-full bg-zinc-950 ${
          isFullscreen ? 'flex-1 min-h-0 h-full' : 'min-h-[520px]'
        }`}
      >
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="w-full h-full block cursor-crosshair"
        />

        {/* Hover Level Inspector Tooltip */}
        {hoveredLevel && (
          <div className="absolute top-4 left-4 z-20 bg-zinc-900/95 border border-zinc-700/80 p-2.5 rounded-lg shadow-xl font-mono text-xs text-zinc-200 pointer-events-none flex flex-col gap-1 backdrop-blur-sm">
            <div className="flex items-center gap-2 border-b border-zinc-800 pb-1">
              <span className="font-bold text-zinc-100">${hoveredLevel.price.toFixed(2)}</span>
              {hoveredLevel.isTPOC && (
                <span className="bg-rose-500 text-white text-[9px] px-1 rounded font-bold">
                  POC
                </span>
              )}
              {hoveredLevel.isValueArea && (
                <span className="bg-sky-500/20 text-sky-400 text-[9px] px-1 rounded border border-sky-500/30">
                  Value Area
                </span>
              )}
            </div>
            <div className="text-[11px] text-zinc-400 flex items-center justify-between gap-4">
              <span>TPO Count:</span>
              <span className="font-bold text-amber-400">{hoveredLevel.tpoCount} periods</span>
            </div>
            <div className="text-[11px] text-zinc-400 flex items-center justify-between gap-4">
              <span>Periods:</span>
              <span className="text-zinc-200">{hoveredLevel.letters.join(' ')}</span>
            </div>
            <div className="text-[11px] text-zinc-400 flex items-center justify-between gap-4">
              <span>Volume:</span>
              <span className="text-cyan-400 font-bold">{Math.round(hoveredLevel.volume)} lots</span>
            </div>
          </div>
        )}

        {/* Heatmap Legend */}
        <div className="absolute bottom-3 left-4 z-10 flex flex-wrap items-center gap-2 bg-zinc-900/90 border border-zinc-800 px-3 py-1.5 rounded-lg font-mono text-[10px] text-zinc-400 backdrop-blur-sm">
          <span className="font-semibold text-zinc-300">Time Heatmap:</span>
          <div className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#2563eb]" />
            <span>A-C (Mở phiên)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#10b981]" />
            <span>D-F (Giữa phiên)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#eab308]" />
            <span>G-I (Chiều)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#ea580c]" />
            <span>J+ (Đóng phiên)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
