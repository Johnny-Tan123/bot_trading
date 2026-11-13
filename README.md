# 🚀 AlgoStudio — Quantitative Backtesting Terminal

Hệ thống Backtesting chiến thuật giao dịch cá nhân với giao diện trực quan chuẩn Trading Terminal, tích hợp **TradingView Lightweight Charts**, **Recharts**, và **V8 High-Speed Simulation Engine**.

---

## ⚡ Khởi chạy ứng dụng

Mở terminal trong thư mục `Bot`:

```bash
# 1. Chạy môi trường phát triển (Dev Server)
npm run dev
```

Sau đó mở trình duyệt tại: **[http://localhost:3005](http://localhost:3005)**

---

## 📁 Cấu trúc Kiến trúc (Architecture)

```text
Bot/
├── src/
│   ├── app/
│   │   ├── page.tsx               # Dashboard chính (HUD, Chart, Controls, Trade Log)
│   │   ├── layout.tsx             # Root layout & Metadata
│   │   ├── globals.css            # Dark mode styling & Tailwind CSS v4
│   │   └── api/
│   │       └── backtest/route.ts  # REST API điều phối nến & tính toán backtest
│   ├── components/
│   │   ├── Header.tsx             # Thanh header thương hiệu
│   │   ├── ControlBar.tsx         # Chọn Cặp tiền, Timeframe, Nến, Vốn, Fee, Slippage
│   │   ├── MetricCards.tsx        # HUD hiển thị Net PnL, Win Rate, Profit Factor, Drawdown, Sharpe
│   │   ├── StrategyPanel.tsx      # Bộ chọn chiến thuật & thanh trượt tham số động + TP/SL
│   │   ├── CandlestickChart.tsx   # Đồ thị nến TradingView + Đánh dấu điểm BUY/SELL/TP/SL + Volume
│   │   ├── EquityChart.tsx        # Biểu đồ tăng trưởng vốn (Equity Curve) & Drawdown
│   │   └── TradeTable.tsx         # Bảng lịch sử từng lệnh (Lọc All, Wins, Losses)
│   ├── engine/
│   │   ├── indicators.ts          # Thư viện tính toán chỉ báo (EMA, SMA, RSI)
│   │   ├── simulator.ts           # Core Backtesting Simulator (khớp lệnh, SL/TP, Fee, Equity)
│   │   └── strategies/            # Nơi chứa các chiến thuật
│   │       ├── ict-strategy.ts    # Chiến thuật ICT Liquidity Sweep + MSS
│   │       └── index.ts           # Danh mục tổng hợp tất cả chiến thuật
│   ├── lib/
│   │   ├── market-data.ts         # Bộ kéo nến XAU (Gold), US100 (Nasdaq), US500 (S&P 500)
│   │   ├── mock-data.ts           # Trình sinh dữ liệu nến thực tế ngẫu nhiên
│   │   └── utils.ts               # Các hàm định dạng tiền tệ ($), phần trăm (%), thời gian
│   └── types/
│       ├── market.ts              # Candle, Timeframe, Symbol
│       ├── strategy.ts            # Signal, ParamDefinition, Strategy interface
│       └── backtest.ts            # Trade, BacktestConfig, BacktestResult, Metrics, EquityPoint
```

---

## 🛠️ Cách thêm một Chiến thuật mới (Add New Strategy)

Chỉ cần 2 bước cực kỳ đơn giản mà **không cần đụng tới giao diện**:

### Bước 1: Tạo file chiến thuật trong `src/engine/strategies/`
Ví dụ: `src/engine/strategies/my-strategy.ts`

```typescript
import { Candle } from '@/types/market';
import { Strategy, Signal } from '@/types/strategy';

export const myStrategy: Strategy<{ period: number }> = {
  id: 'my-strategy',
  name: 'My Custom Strategy',
  description: 'Mô tả ngắn gọn về chiến thuật của bạn...',
  defaultParams: {
    period: 20,
  },
  paramDefinitions: [
    {
      key: 'period',
      label: 'Period Length',
      type: 'number',
      defaultValue: 20,
      min: 5,
      max: 100,
      step: 1,
    },
  ],
  execute: (candles: Candle[], params): Signal[] => {
    const signals: Signal[] = [];

    // Viết logic sinh tín hiệu BUY / CLOSE ở đây
    for (let i = 1; i < candles.length; i++) {
      if (/* điều kiện Mua */ false) {
        signals.push({
          time: candles[i].time,
          type: 'BUY',
          price: candles[i].close,
          reason: 'Entry reason',
        });
      }
    }

    return signals;
  },
};
```

### Bước 2: Đăng ký vào `src/engine/strategies/index.ts`

Thêm chiến thuật vào mảng `STRATEGIES`:

```typescript
import { myStrategy } from './my-strategy';

export const STRATEGIES: Strategy<any>[] = [
  emaCrossStrategy,
  rsiStrategy,
  myStrategy, // <-- Thêm vào đây
];
```

🎉 **Xong!** Giao diện web sẽ tự động nhận diện chiến thuật mới, tự sinh ra thanh trượt (slider) cho các tham số trong `paramDefinitions`, và hiển thị ngay trên đồ thị.
