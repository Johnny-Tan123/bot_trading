'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  createSeriesMarkers,
  ColorType,
  Time,
  IChartApi,
  ISeriesApi,
  IPriceLine,
  ISeriesMarkersPluginApi,
  SeriesMarker,
  LineStyle,
} from 'lightweight-charts';
import { Candle } from '@/types/market';
import { Trade } from '@/types/backtest';
import { detectFVGs, FVG } from '@/engine/fvg';
import {
  calculateVolumeProfile,
  calculateSessionVolumeProfiles,
  VolumeProfileResult,
  SessionVolumeProfile,
} from '@/engine/volume-profile';
import {
  BarChart3,
  Crosshair,
  X,
  Radio,
  Eye,
  EyeOff,
  Layers,
  BarChart2,
  Maximize2,
  Minimize2,
} from 'lucide-react';

interface CandlestickChartProps {
  candles: Candle[];
  trades: Trade[];
  symbol: string;
  timeframe: string;
  selectedTrade?: Trade | null;
  onClearSelectedTrade?: () => void;
  isLiveSync?: boolean;
}

export function CandlestickChart({
  candles,
  trades,
  symbol,
  timeframe,
  selectedTrade,
  onClearSelectedTrade,
  isLiveSync = true,
}: CandlestickChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick', Time> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram', Time> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const hasFittedRef = useRef<boolean>(false);
  const hasSetDataRef = useRef<boolean>(false);
  const prevCandlesLengthRef = useRef<number>(0);
  const lastFocusedTradeKeyRef = useRef<string | null>(null);

  // VP Mode: 'SESSION' (TradingView SVP - By Day, exactly like screenshot) | 'VISIBLE_RANGE' | 'OFF'
  const [vpMode, setVpMode] = useState<'SESSION' | 'VISIBLE_RANGE' | 'OFF'>('SESSION');
  const [showFVG, setShowFVG] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Close fullscreen on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Trigger resize and overlay redraw when toggling fullscreen
  useEffect(() => {
    const timer = setTimeout(() => {
      const container = chartContainerRef.current;
      const chart = chartInstanceRef.current;
      if (container && chart) {
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w > 0 && h > 0) {
          chart.applyOptions({ width: w, height: h });
        }
      }
      drawOverlaysRef.current();
    }, 60);
    return () => clearTimeout(timer);
  }, [isFullscreen]);

  // Compute detected FVGs and BAGs
  const detectedFVGs = useMemo<FVG[]>(() => {
    return detectFVGs(candles);
  }, [candles]);

  // Compute Session Volume Profiles (TradingView SVP by Day)
  const sessionVPs = useMemo<SessionVolumeProfile[]>(() => {
    return calculateSessionVolumeProfiles(candles, 36);
  }, [candles]);

  // Compute Visible Range Volume Profile (Overall VRVP)
  const vrvpProfile = useMemo<VolumeProfileResult | null>(() => {
    return calculateVolumeProfile(candles, 50, 70);
  }, [candles]);

  // Combined Canvas drawing function for Session VP, VRVP & FVG
  const drawOverlays = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    const container = chartContainerRef.current;
    const chart = chartInstanceRef.current;
    const series = candleSeriesRef.current;

    if (!canvas || !container || !chart || !series) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Exact dynamic price scale width from Lightweight Charts (prevents overlays bleeding into price axis)
    const priceScaleWidth = series.priceScale().width() || 68;
    const maxDrawX = Math.max(10, width - priceScaleWidth);

    // A. TRADINGVIEW SESSION VOLUME PROFILE (SVP - BY DAY AS IN SCREENSHOT)
    if (vpMode === 'SESSION' && sessionVPs.length > 0) {
      // Estimate bar spacing in pixels for seamless session boundary alignment
      let barSpacing = 8;
      if (candles.length >= 2) {
        const c1 = chart.timeScale().timeToCoordinate(candles[candles.length - 1].time as Time);
        const c2 = chart.timeScale().timeToCoordinate(candles[candles.length - 2].time as Time);
        if (c1 !== null && c2 !== null) {
          barSpacing = Math.max(3, Math.abs(c1 - c2));
        }
      }
      const halfBar = barSpacing / 2;

      sessionVPs.forEach((s) => {
        const x1 = chart.timeScale().timeToCoordinate(s.startTime as Time);
        const x2 = chart.timeScale().timeToCoordinate(s.endTime as Time);

        // Approximate if only one edge is visible
        if (x1 === null && x2 === null) return;
        const rawX1 = x1 !== null ? x1 - halfBar : 0;
        const rawX2 = x2 !== null ? x2 + halfBar : maxDrawX;

        const drawX1 = Math.max(0, Math.min(maxDrawX, rawX1));
        const drawX2 = Math.max(drawX1 + 10, Math.min(maxDrawX, rawX2));

        if (drawX2 < 0 || drawX1 > maxDrawX) return;

        const yTop = series.priceToCoordinate(s.high);
        const yBottom = series.priceToCoordinate(s.low);
        if (yTop === null || yBottom === null) return;

        const minY = Math.min(yTop, yBottom);
        const maxY = Math.max(yTop, yBottom);
        const boxHeight = Math.max(10, maxY - minY);
        const boxWidth = Math.max(15, drawX2 - drawX1);

        ctx.save();

        // 1. Session Background Box (Dark blue-slate translucent box matching TradingView screenshot)
        ctx.fillStyle = 'rgba(15, 23, 42, 0.42)';
        ctx.fillRect(drawX1, minY, boxWidth, boxHeight);

        ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
        ctx.lineWidth = 1;
        ctx.strokeRect(drawX1, minY, boxWidth, boxHeight);

        // 2. Vertical Dotted Session Divider Line (at right boundary of session)
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
        ctx.beginPath();
        ctx.moveTo(drawX2, 0);
        ctx.lineTo(drawX2, height);
        ctx.stroke();
        ctx.setLineDash([]);

        // 3. Dual-Color Volume Profile Bars on the LEFT edge of this session
        const maxVol = s.vp.pocVolume || 1;
        const maxBarWidth = Math.min(boxWidth * 0.38, 130);

        s.vp.bins.forEach((bin) => {
          const yBTop = series.priceToCoordinate(bin.priceHigh);
          const yBBot = series.priceToCoordinate(bin.priceLow);
          if (yBTop === null || yBBot === null) return;

          const bMinY = Math.min(yBTop, yBBot);
          const bMaxY = Math.max(yBTop, yBBot);
          const barH = Math.max(1.5, bMaxY - bMinY - 0.5);

          const totW = Math.max(2, (bin.volume / maxVol) * maxBarWidth);
          const buyRatio = bin.volume > 0 ? bin.buyVolume / bin.volume : 0.55;
          const buyW = totW * buyRatio;
          const sellW = totW - buyW;

          const inVA = bin.isValueArea;

          // TradingView Colors: Vibrant Cyan (Buy Volume) + Crimson/Magenta (Sell Volume)
          const buyColor = inVA ? '#06b6d4' : 'rgba(6, 182, 212, 0.38)';
          const sellColor = inVA ? '#e11d48' : 'rgba(225, 29, 72, 0.38)';

          // Buy (Left)
          ctx.fillStyle = buyColor;
          ctx.fillRect(drawX1, bMinY, buyW, barH);

          // Sell (Right)
          ctx.fillStyle = sellColor;
          ctx.fillRect(drawX1 + buyW, bMinY, sellW, barH);
        });

        // 4. Solid White POC Line (Spanning across this session box, matching screenshot!)
        const yPOC = series.priceToCoordinate(s.vp.pocPrice);
        if (yPOC !== null) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(drawX1, yPOC);
          ctx.lineTo(drawX2, yPOC);
          ctx.stroke();

          // Small POC Tag at right edge of session box (avoids blocking volume bars on left)
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'bottom';
          ctx.fillText(`POC ${s.vp.pocPrice.toFixed(1)}`, drawX2 - 4, yPOC - 2);
        }

        ctx.restore();
      });
    }

    // B. TRADINGVIEW VISIBLE RANGE VOLUME PROFILE (VRVP - RIGHT PINNED)
    else if (vpMode === 'VISIBLE_RANGE' && vrvpProfile && vrvpProfile.bins.length > 0) {
      const maxVol = vrvpProfile.pocVolume || 1;
      const maxBarWidth = Math.min(140, width * 0.18);

      vrvpProfile.bins.forEach((bin) => {
        const yTop = series.priceToCoordinate(bin.priceHigh);
        const yBottom = series.priceToCoordinate(bin.priceLow);
        if (yTop === null || yBottom === null) return;

        const minY = Math.min(yTop, yBottom);
        const maxY = Math.max(yTop, yBottom);
        const barHeight = Math.max(2, maxY - minY);

        const totalBarWidth = Math.max(2, (bin.volume / maxVol) * maxBarWidth);
        const buyRatio = bin.volume > 0 ? bin.buyVolume / bin.volume : 0.55;
        const buyWidth = totalBarWidth * buyRatio;
        const sellWidth = totalBarWidth - buyWidth;

        const inVA = bin.isValueArea;
        const buyColor = inVA ? '#06b6d4' : 'rgba(6, 182, 212, 0.35)';
        const sellColor = inVA ? '#e11d48' : 'rgba(225, 29, 72, 0.35)';

        const barStartX = maxDrawX - totalBarWidth;

        ctx.save();
        ctx.fillStyle = buyColor;
        ctx.fillRect(barStartX, minY, buyWidth, barHeight);

        ctx.fillStyle = sellColor;
        ctx.fillRect(barStartX + buyWidth, minY, sellWidth, barHeight);
        ctx.restore();
      });

      const yPOC = series.priceToCoordinate(vrvpProfile.pocPrice);
      if (yPOC !== null) {
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, yPOC);
        ctx.lineTo(maxDrawX, yPOC);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`POC: $${vrvpProfile.pocPrice.toFixed(1)}`, maxDrawX - 4, yPOC - 4);
        ctx.restore();
      }
    }

    // C. DRAW FVG & BAG ZONES
    if (showFVG && detectedFVGs.length > 0) {
      detectedFVGs.forEach((fvg) => {
        const x1 = chart.timeScale().timeToCoordinate(fvg.startTime as Time);
        if (x1 === null) return;

        let x2: number | null = null;
        if (fvg.isMitigated && fvg.mitigatedTime) {
          x2 = chart.timeScale().timeToCoordinate(fvg.mitigatedTime as Time);
        }
        if (x2 === null || !fvg.isMitigated) {
          x2 = maxDrawX;
        }

        if (x2 < 0 || x1 > maxDrawX) return;

        const drawX1 = Math.max(0, x1);
        const drawX2 = Math.min(maxDrawX, x2);
        const boxWidth = Math.max(2, drawX2 - drawX1);

        const yTop = series.priceToCoordinate(fvg.topPrice);
        const yBottom = series.priceToCoordinate(fvg.bottomPrice);
        if (yTop === null || yBottom === null) return;

        const minY = Math.min(yTop, yBottom);
        const maxY = Math.max(yTop, yBottom);
        const boxHeight = Math.max(2, maxY - minY);
        const midY = (minY + maxY) / 2;

        ctx.save();

        if (fvg.isBAG) {
          ctx.fillStyle = fvg.isMitigated ? 'rgba(245, 158, 11, 0.08)' : 'rgba(245, 158, 11, 0.18)';
          ctx.fillRect(drawX1, minY, boxWidth, boxHeight);

          ctx.strokeStyle = fvg.isMitigated ? 'rgba(245, 158, 11, 0.35)' : 'rgba(245, 158, 11, 0.85)';
          ctx.lineWidth = fvg.isMitigated ? 1 : 1.5;
          ctx.strokeRect(drawX1, minY, boxWidth, boxHeight);

          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(drawX1, midY);
          ctx.lineTo(drawX1 + boxWidth, midY);
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
          ctx.stroke();

          if (boxWidth > 45) {
            ctx.setLineDash([]);
            ctx.font = 'bold 9px monospace';
            ctx.fillStyle = '#f59e0b';
            ctx.fillText('BAG ⚡', drawX1 + 4, minY + Math.min(11, boxHeight - 2));
          }
        } else if (!fvg.isMitigated) {
          if (fvg.type === 'BULLISH') {
            ctx.fillStyle = 'rgba(16, 185, 129, 0.14)';
            ctx.fillRect(drawX1, minY, boxWidth, boxHeight);

            ctx.strokeStyle = 'rgba(16, 185, 129, 0.55)';
            ctx.lineWidth = 1;
            ctx.strokeRect(drawX1, minY, boxWidth, boxHeight);

            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(drawX1, midY);
            ctx.lineTo(drawX1 + boxWidth, midY);
            ctx.strokeStyle = 'rgba(16, 185, 129, 0.7)';
            ctx.stroke();

            if (boxWidth > 35) {
              ctx.setLineDash([]);
              ctx.font = '9px monospace';
              ctx.fillStyle = '#10b981';
              ctx.fillText('FVG +', drawX1 + 4, minY + Math.min(10, boxHeight - 2));
            }
          } else {
            ctx.fillStyle = 'rgba(239, 68, 68, 0.14)';
            ctx.fillRect(drawX1, minY, boxWidth, boxHeight);

            ctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
            ctx.lineWidth = 1;
            ctx.strokeRect(drawX1, minY, boxWidth, boxHeight);

            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(drawX1, midY);
            ctx.lineTo(drawX1 + boxWidth, midY);
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
            ctx.stroke();

            if (boxWidth > 35) {
              ctx.setLineDash([]);
              ctx.font = '9px monospace';
              ctx.fillStyle = '#ef4444';
              ctx.fillText('FVG -', drawX1 + 4, minY + Math.min(10, boxHeight - 2));
            }
          }
        } else {
          ctx.fillStyle = 'rgba(113, 113, 122, 0.05)';
          ctx.fillRect(drawX1, minY, boxWidth, boxHeight);

          ctx.strokeStyle = 'rgba(113, 113, 122, 0.2)';
          ctx.lineWidth = 0.8;
          ctx.setLineDash([2, 4]);
          ctx.strokeRect(drawX1, minY, boxWidth, boxHeight);
        }

        ctx.restore();
      });
    }

    ctx.restore();
  }, [vpMode, showFVG, sessionVPs, vrvpProfile, detectedFVGs]);

  // Keep ref to latest drawOverlays function for event callbacks without tearing down the chart
  const drawOverlaysRef = useRef(drawOverlays);
  useEffect(() => {
    drawOverlaysRef.current = drawOverlays;
  });

  // 1. Initialize chart canvas on symbol/timeframe switch
  useEffect(() => {
    if (!chartContainerRef.current) return;

    hasFittedRef.current = false;
    hasSetDataRef.current = false;
    prevCandlesLengthRef.current = 0;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      markersPluginRef.current = null;
      priceLinesRef.current = [];
    }

    const container = chartContainerRef.current;
    container.innerHTML = '';
    const initialWidth = container.clientWidth || 800;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#09090b' },
        textColor: '#a1a1aa',
        fontSize: 12,
        fontFamily: 'monospace, system-ui, sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(39, 39, 42, 0.4)' },
        horzLines: { color: 'rgba(39, 39, 42, 0.4)' },
      },
      crosshair: {
        vertLine: {
          color: '#71717a',
          width: 1,
          style: 3,
          labelBackgroundColor: '#27272a',
        },
        horzLine: {
          color: '#71717a',
          width: 1,
          style: 3,
          labelBackgroundColor: '#27272a',
        },
      },
      rightPriceScale: {
        borderColor: '#27272a',
        scaleMargins: {
          top: 0.1,
          bottom: 0.25,
        },
      },
      timeScale: {
        borderColor: '#27272a',
        timeVisible: true,
        secondsVisible: false,
      },
      width: initialWidth,
      height: 520,
    });

    chartInstanceRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });
    candleSeriesRef.current = candleSeries;

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '',
      lastValueVisible: false, // Hides volume value badge from price scale
      priceLineVisible: false, // Hides volume horizontal line from price scale
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });
    volumeSeriesRef.current = volumeSeries;

    markersPluginRef.current = createSeriesMarkers(candleSeries, []);

    // Sync on horizontal pan / zoom
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      requestAnimationFrame(() => drawOverlaysRef.current());
    });

    // Real-time synchronization while dragging chart or stretching price scale / time scale
    let isDragging = false;
    let animFrameId: number | null = null;

    const runDragLoop = () => {
      if (!isDragging) return;
      drawOverlaysRef.current();
      animFrameId = requestAnimationFrame(runDragLoop);
    };

    const handlePointerDown = () => {
      isDragging = true;
      if (animFrameId) cancelAnimationFrame(animFrameId);
      animFrameId = requestAnimationFrame(runDragLoop);
    };

    const handlePointerUp = () => {
      if (isDragging) {
        isDragging = false;
        if (animFrameId) cancelAnimationFrame(animFrameId);
        requestAnimationFrame(() => drawOverlaysRef.current());
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (e.buttons > 0 && !isDragging) {
        isDragging = true;
        runDragLoop();
      }
    };

    const handleWheel = () => {
      requestAnimationFrame(() => drawOverlaysRef.current());
    };

    const handleDblClick = () => {
      setTimeout(() => drawOverlaysRef.current(), 60);
    };

    container.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('wheel', handleWheel, { passive: true });
    container.addEventListener('dblclick', handleDblClick);

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({
          width,
          ...(height > 0 ? { height } : {}),
        });
        requestAnimationFrame(() => drawOverlaysRef.current());
      }
    });

    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('dblclick', handleDblClick);
      if (animFrameId) cancelAnimationFrame(animFrameId);
      resizeObserver.disconnect();
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
        candleSeriesRef.current = null;
        volumeSeriesRef.current = null;
        markersPluginRef.current = null;
        priceLinesRef.current = [];
      }
    };
  }, [symbol, timeframe]);

  // 2. Update Series Data (Smart update: setData on first load / symbol change, .update() on live ticks)
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const chart = chartInstanceRef.current;

    if (!candleSeries || !volumeSeries || !chart || !candles || candles.length === 0) {
      return;
    }

    const isFullDatasetChange =
      !hasSetDataRef.current || Math.abs(candles.length - prevCandlesLengthRef.current) > 2;

    if (isFullDatasetChange) {
      const formattedCandles = candles.map((c) => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

      const formattedVolumes = candles.map((c) => ({
        time: c.time as Time,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)',
      }));

      candleSeries.setData(formattedCandles);
      volumeSeries.setData(formattedVolumes);
      hasSetDataRef.current = true;
      prevCandlesLengthRef.current = candles.length;

      if (!hasFittedRef.current) {
        if (candles.length > 120) {
          chart.timeScale().setVisibleLogicalRange({
            from: candles.length - 120,
            to: candles.length + 5,
          });
        } else {
          chart.timeScale().fitContent();
        }
        hasFittedRef.current = true;
      }
    } else {
      // Live candle tick: update ONLY the forming candle, preserving user zoom and price scale stretch
      const lastC = candles[candles.length - 1];
      candleSeries.update({
        time: lastC.time as Time,
        open: lastC.open,
        high: lastC.high,
        low: lastC.low,
        close: lastC.close,
      });
      volumeSeries.update({
        time: lastC.time as Time,
        value: lastC.volume,
        color: lastC.close >= lastC.open ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)',
      });
      prevCandlesLengthRef.current = candles.length;
    }

    // Update ICT markers
    const markers: SeriesMarker<Time>[] = [];

    trades.forEach((trade) => {
      const isLong = trade.type === 'LONG';
      const isWin = trade.pnl > 0;

      if (trade.sweepTime) {
        markers.push({
          time: trade.sweepTime as Time,
          position: isLong ? 'belowBar' : 'aboveBar',
          color: isLong ? '#06b6d4' : '#c084fc',
          shape: 'circle',
          text: isLong ? 'LS: SSL' : 'LS: BSL',
        });
      }

      markers.push({
        time: trade.entryTime as Time,
        position: isLong ? 'belowBar' : 'aboveBar',
        color: isLong ? '#10b981' : '#f59e0b',
        shape: isLong ? 'arrowUp' : 'arrowDown',
        text: isLong
          ? `MSS ↑ LONG @$${trade.entryPrice.toFixed(1)}`
          : `MSS ↓ SHORT @$${trade.entryPrice.toFixed(1)}`,
      });

      markers.push({
        time: trade.exitTime as Time,
        position: isLong ? 'aboveBar' : 'belowBar',
        color: isWin ? '#10b981' : '#ef4444',
        shape: isLong ? 'arrowDown' : 'arrowUp',
        text: `${trade.exitReason} (${isWin ? '+' : ''}${trade.pnlPercent.toFixed(1)}%)`,
      });
    });

    const markerMap = new Map<number, SeriesMarker<Time>>();
    markers.forEach((m) => {
      const timeKey = Number(m.time);
      if (markerMap.has(timeKey)) {
        const existing = markerMap.get(timeKey)!;
        existing.text = `${existing.text} • ${m.text}`;
      } else {
        markerMap.set(timeKey, { ...m });
      }
    });

    const uniqueMarkers = Array.from(markerMap.values()).sort(
      (a, b) => Number(a.time) - Number(b.time)
    );

    if (markersPluginRef.current) {
      markersPluginRef.current.setMarkers(uniqueMarkers);
    }

    requestAnimationFrame(() => drawOverlaysRef.current());
  }, [candles, trades]);

  // 3. Trade Focus & Price Lines
  useEffect(() => {
    const series = candleSeriesRef.current;
    const chart = chartInstanceRef.current;
    if (!series || !chart) return;

    priceLinesRef.current.forEach((line) => {
      try {
        series.removePriceLine(line);
      } catch {
        // ignore
      }
    });
    priceLinesRef.current = [];

    if (!selectedTrade) {
      lastFocusedTradeKeyRef.current = null;
      return;
    }

    const entryLine = series.createPriceLine({
      price: selectedTrade.entryPrice,
      color: '#38bdf8',
      lineWidth: 2,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: true,
      title: `ENTRY: $${selectedTrade.entryPrice.toFixed(1)}`,
    });
    priceLinesRef.current.push(entryLine);

    if (selectedTrade.stopLossPrice) {
      const slLine = series.createPriceLine({
        price: selectedTrade.stopLossPrice,
        color: '#ef4444',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `SL (Sweep): $${selectedTrade.stopLossPrice.toFixed(1)}`,
      });
      priceLinesRef.current.push(slLine);
    }

    if (selectedTrade.takeProfitPrice) {
      const tpLine = series.createPriceLine({
        price: selectedTrade.takeProfitPrice,
        color: '#10b981',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `TP: $${selectedTrade.takeProfitPrice.toFixed(1)}`,
      });
      priceLinesRef.current.push(tpLine);
    }

    // Only zoom once when a new trade is selected
    const tradeKey = `${selectedTrade.id}_${selectedTrade.entryTime}`;
    if (lastFocusedTradeKeyRef.current !== tradeKey) {
      lastFocusedTradeKeyRef.current = tradeKey;
      const tradeIndex = candles.findIndex((c) => c.time === selectedTrade.entryTime);
      if (tradeIndex !== -1) {
        const from = Math.max(0, tradeIndex - 30);
        chart.timeScale().setVisibleLogicalRange({
          from,
          to: Math.min(candles.length - 1, tradeIndex + 30),
        });
      }
    }
  }, [selectedTrade, candles]);

  useEffect(() => {
    requestAnimationFrame(() => drawOverlaysRef.current());
  }, [vpMode, showFVG]);

  // Calculate live stats
  const latestCandle = candles.length > 0 ? candles[candles.length - 1] : null;
  const prevCandle = candles.length > 1 ? candles[candles.length - 2] : null;
  const currentPrice = latestCandle ? latestCandle.close : null;
  const priceChange =
    latestCandle && prevCandle
      ? latestCandle.close - prevCandle.close
      : latestCandle
      ? latestCandle.close - latestCandle.open
      : 0;
  const priceChangePct =
    prevCandle && prevCandle.close > 0 ? (priceChange / prevCandle.close) * 100 : 0;
  const isUp = priceChange >= 0;

  return (
    <div
      className={`transition-all duration-200 flex flex-col ${
        isFullscreen
          ? 'fixed inset-0 z-50 bg-zinc-950 p-2 sm:p-4 w-screen h-screen'
          : 'bg-zinc-900/70 border border-zinc-800 rounded-xl overflow-hidden'
      }`}
    >
      {/* Chart Top Bar */}
      <div className="px-4 py-2.5 border-b border-zinc-800/80 bg-zinc-950/60 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-emerald-400" />
            <span className="font-bold text-xs text-zinc-100 font-mono tracking-wider">
              {symbol} • {timeframe.toUpperCase()}
            </span>
            <span className="text-[11px] text-zinc-500 font-mono">
              ({candles.length} bars)
            </span>
          </div>

          {/* Realtime Live Price HUD */}
          {currentPrice !== null && (
            <div className="flex items-center gap-2 bg-zinc-900/90 border border-zinc-700/60 px-2.5 py-1 rounded-md font-mono text-xs">
              <span className="relative flex h-2 w-2">
                {isLiveSync && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    isLiveSync ? 'bg-emerald-500' : 'bg-zinc-500'
                  }`}
                />
              </span>
              <span className="text-zinc-400 text-[11px] flex items-center gap-1 font-sans">
                <Radio className="h-3 w-3 text-emerald-400" />
                {isLiveSync ? 'LIVE' : 'STATIC'}
              </span>
              <span className="font-bold text-zinc-100 font-mono">
                ${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span
                className={`text-[11px] font-semibold ${
                  isUp ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {isUp ? '+' : ''}
                {priceChange.toFixed(2)} ({isUp ? '+' : ''}
                {priceChangePct.toFixed(2)}%)
              </span>
            </div>
          )}
        </div>

        {/* Selected trade focus banner */}
        {selectedTrade && (
          <div className="flex items-center gap-2 bg-sky-500/10 border border-sky-500/30 px-2.5 py-1 rounded-md text-xs font-mono text-sky-400">
            <Crosshair className="h-3.5 w-3.5 animate-pulse" />
            <span>
              Focusing: {selectedTrade.type} @${selectedTrade.entryPrice.toFixed(1)}
            </span>
            {onClearSelectedTrade && (
              <button
                onClick={onClearSelectedTrade}
                className="hover:text-zinc-100 ml-1 cursor-pointer"
                title="Clear selection"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Controls: Volume Profile Mode (Session / VRVP), FVG Toggle, Legend & Fullscreen Button */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          {/* TradingView Session Volume Profile (SVP) Mode Switcher */}
          <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-md overflow-hidden p-0.5">
            <button
              onClick={() => setVpMode('SESSION')}
              className={`px-2 py-0.5 text-[10px] font-semibold rounded transition cursor-pointer ${
                vpMode === 'SESSION'
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Session Volume Profile: Chia theo từng ngày (giống TradingView SVP)"
            >
              Theo Ngày (SVP)
            </button>
            <button
              onClick={() => setVpMode('VISIBLE_RANGE')}
              className={`px-2 py-0.5 text-[10px] font-semibold rounded transition cursor-pointer ${
                vpMode === 'VISIBLE_RANGE'
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Visible Range Volume Profile: Toàn màn hình"
            >
              Toàn màn (VRVP)
            </button>
            <button
              onClick={() => setVpMode(vpMode === 'OFF' ? 'SESSION' : 'OFF')}
              className={`px-1.5 py-0.5 text-[10px] rounded transition cursor-pointer ${
                vpMode === 'OFF' ? 'bg-zinc-800 text-zinc-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Tắt Volume Profile"
            >
              {vpMode === 'OFF' ? 'Bật VP' : 'Tắt'}
            </button>
          </div>

          {/* FVG & BAG Toggle Button */}
          <button
            onClick={() => setShowFVG(!showFVG)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold border transition cursor-pointer ${
              showFVG
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300'
            }`}
            title="Bật/Tắt hiển thị vùng FVG và BAG trên biểu đồ"
          >
            <Layers className="h-3 w-3" />
            <span>FVG/BAG ({detectedFVGs.length})</span>
            {showFVG ? (
              <Eye className="h-3 w-3 text-emerald-400 ml-0.5" />
            ) : (
              <EyeOff className="h-3 w-3 text-zinc-600 ml-0.5" />
            )}
          </button>

          {/* Visual Legend */}
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-cyan-400" />
            <span className="text-zinc-400 text-[11px]">LS</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-emerald-400" />
            <span className="text-zinc-400 text-[11px]">MSS</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-white" />
            <span className="text-zinc-200 text-[11px] font-bold">POC</span>
          </div>

          {/* Fullscreen Maximize / Minimize Button */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold border transition cursor-pointer ${
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

      {/* Chart Canvas & Overlays Container */}
      <div className={`relative w-full ${isFullscreen ? 'flex-1 min-h-0 h-full' : 'min-h-[540px] h-[540px]'}`}>
        <div ref={chartContainerRef} className="w-full h-full" />
        <canvas
          ref={overlayCanvasRef}
          className="pointer-events-none absolute inset-0 z-10 w-full h-full"
        />
      </div>
    </div>
  );
}
