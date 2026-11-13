'use client';

import React, { useState } from 'react';
import { Trade } from '@/types/backtest';
import { formatCurrency, formatPercent, formatTimestamp, formatDuration } from '@/lib/utils';
import {
  ListFilter,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Crosshair,
  ChevronLeft,
  ChevronRight,
  Shield,
  Target,
} from 'lucide-react';

interface TradeTableProps {
  trades: Trade[];
  selectedTrade?: Trade | null;
  onSelectTrade?: (trade: Trade) => void;
}

export function TradeTable({ trades, selectedTrade, onSelectTrade }: TradeTableProps) {
  const [filter, setFilter] = useState<'ALL' | 'WIN' | 'LOSS'>('ALL');
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const filteredTrades = trades.filter((t) => {
    if (filter === 'WIN') return t.pnl > 0;
    if (filter === 'LOSS') return t.pnl <= 0;
    return true;
  });

  const winCount = trades.filter((t) => t.pnl > 0).length;
  const lossCount = trades.filter((t) => t.pnl <= 0).length;

  const totalPages = pageSize === -1 ? 1 : Math.ceil(filteredTrades.length / pageSize) || 1;
  const safePage = Math.min(currentPage, totalPages);

  const paginatedTrades =
    pageSize === -1
      ? filteredTrades
      : filteredTrades.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
      {/* Table Header Controls */}
      <div className="px-4 py-3 border-b border-zinc-800/80 bg-zinc-950/50 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ListFilter className="h-4 w-4 text-emerald-400" />
          <h3 className="font-bold text-xs text-zinc-100 uppercase tracking-wider font-mono">
            Trade Log Journal
          </h3>
          <span className="text-xs text-zinc-400 font-mono">
            ({trades.length} lệnh - Không giới hạn số lượng)
          </span>
          <span className="text-[11px] text-zinc-500 font-sans hidden sm:inline">
            • Bấm vào dòng để zoom & xem SL/TP trên Chart
          </span>
        </div>

        {/* Filter Buttons & Page Size */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Win/Loss Filter */}
          <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800 text-xs">
            <button
              onClick={() => {
                setFilter('ALL');
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded font-medium transition cursor-pointer ${
                filter === 'ALL'
                  ? 'bg-zinc-800 text-zinc-100 font-bold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              All ({trades.length})
            </button>
            <button
              onClick={() => {
                setFilter('WIN');
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded font-medium transition cursor-pointer ${
                filter === 'WIN'
                  ? 'bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Wins ({winCount})
            </button>
            <button
              onClick={() => {
                setFilter('LOSS');
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded font-medium transition cursor-pointer ${
                filter === 'LOSS'
                  ? 'bg-rose-500/20 text-rose-400 font-bold border border-rose-500/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Losses ({lossCount})
            </button>
          </div>

          {/* Rows per page */}
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <span>Hiển thị:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-zinc-950 border border-zinc-700 text-zinc-200 text-xs rounded px-2 py-1 focus:outline-none cursor-pointer"
            >
              <option value={10}>10 dòng</option>
              <option value={25}>25 dòng</option>
              <option value={50}>50 dòng</option>
              <option value={100}>100 dòng</option>
              <option value={-1}>Tất cả ({trades.length})</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
        <table className="w-full text-left border-collapse text-xs font-mono">
          <thead className="bg-zinc-950/90 sticky top-0 z-10 text-[11px] text-zinc-400 border-b border-zinc-800">
            <tr>
              <th className="py-2.5 px-3">#</th>
              <th className="py-2.5 px-3">Side</th>
              <th className="py-2.5 px-3">Entry Price & Time</th>
              <th className="py-2.5 px-3">SL (Sweep Wick)</th>
              <th className="py-2.5 px-3">TP (Target)</th>
              <th className="py-2.5 px-3">Exit Price & Time</th>
              <th className="py-2.5 px-3">Duration</th>
              <th className="py-2.5 px-3">Exit Reason</th>
              <th className="py-2.5 px-3 text-right">Fee</th>
              <th className="py-2.5 px-3 text-right">Net PnL</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {paginatedTrades.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-8 text-zinc-500">
                  Không có lệnh nào phù hợp với bộ lọc hiện tại.
                </td>
              </tr>
            ) : (
              paginatedTrades.map((trade, idx) => {
                const isWin = trade.pnl > 0;
                const isSelected = selectedTrade?.id === trade.id;
                const globalIndex = pageSize === -1 ? idx + 1 : (safePage - 1) * pageSize + idx + 1;

                return (
                  <tr
                    key={trade.id}
                    onClick={() => onSelectTrade?.(trade)}
                    className={`transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-sky-500/15 border-l-4 border-sky-400 font-medium'
                        : 'hover:bg-zinc-800/40'
                    }`}
                  >
                    <td className="py-2 px-3 text-zinc-500">
                      <div className="flex items-center gap-1.5">
                        {isSelected && <Crosshair className="h-3 w-3 text-sky-400" />}
                        <span>{globalIndex}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      {trade.type === 'LONG' ? (
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded text-[10px] border border-emerald-500/20">
                          <ArrowUpRight className="h-3 w-3" />
                          LONG
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded text-[10px] border border-amber-500/20">
                          <ArrowDownRight className="h-3 w-3" />
                          SHORT
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <div className="text-zinc-200 font-semibold">${trade.entryPrice.toFixed(2)}</div>
                      <div className="text-[10px] text-zinc-500">
                        {formatTimestamp(trade.entryTime)}
                      </div>
                    </td>
                    {/* Stop Loss column */}
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1 text-rose-400">
                        <Shield className="h-3 w-3" />
                        <span>
                          {trade.stopLossPrice ? `$${trade.stopLossPrice.toFixed(2)}` : 'N/A'}
                        </span>
                      </div>
                    </td>
                    {/* Take Profit column */}
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1 text-emerald-400">
                        <Target className="h-3 w-3" />
                        <span>
                          {trade.takeProfitPrice ? `$${trade.takeProfitPrice.toFixed(2)}` : 'N/A'}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <div className="text-zinc-200 font-semibold">${trade.exitPrice.toFixed(2)}</div>
                      <div className="text-[10px] text-zinc-500">
                        {formatTimestamp(trade.exitTime)}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-zinc-400">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-zinc-500" />
                        <span>{formatDuration(trade.durationSeconds)}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-semibold border ${
                          trade.exitReason === 'TP'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : trade.exitReason === 'SL'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                        }`}
                      >
                        {trade.exitReason}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right text-zinc-400">
                      ${trade.feePaid.toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-right font-bold">
                      <div className={isWin ? 'text-emerald-400' : 'text-rose-400'}>
                        {formatPercent(trade.pnlPercent)}
                      </div>
                      <div
                        className={`text-[10px] font-normal ${
                          isWin ? 'text-emerald-400/80' : 'text-rose-400/80'
                        }`}
                      >
                        {formatCurrency(trade.pnl)}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {pageSize !== -1 && totalPages > 1 && (
        <div className="px-4 py-2 border-t border-zinc-800/80 bg-zinc-950/60 flex items-center justify-between text-xs font-mono">
          <span className="text-zinc-400 text-[11px]">
            Đang xem {(safePage - 1) * pageSize + 1} -{' '}
            {Math.min(safePage * pageSize, filteredTrades.length)} trong tổng số{' '}
            {filteredTrades.length} lệnh
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Trước</span>
            </button>
            <span className="text-zinc-300 px-1 font-semibold">
              {safePage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
            >
              <span>Sau</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
