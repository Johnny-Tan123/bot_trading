# Tài Liệu Kỹ Thuật: TPO Market Profile & Volume Profile

> **Dự án:** Bot Strategy Backtesting Dashboard  
> **Tác giả:** Antigravity AI Assistant  
> **Ngôn ngữ & Nền tảng:** Next.js 16 (App Router), TypeScript, Tailwind CSS v4, TradingView Lightweight Charts  
> **Mục đích:** Hướng dẫn chi tiết nguyên lý toán học, thuật toán phân phối khối lượng/thời gian, mã nguồn xây dựng và cách đọc biểu đồ thực chiến.

---

## 1. Giới Thiệu & Triết Lý Đấu Giá (Market Auction Theory)

Biểu đồ nến truyền thống (Candlestick) chỉ biểu thị **2 chiều**:
* **Trục dọc ($Y$):** Giá cả (Price)
* **Trục ngang ($X$):** Thời gian (Time)

Tuy nhiên, thị trường tài chính bản chất là một **buổi đấu giá liên tục (Continuous Double Auction)** giữa phe Mua (Buyers) và phe Bán (Sellers). Để biết một mức giá có được thị trường chấp nhận (*Fair Value / Acceptance*) hay bị từ chối (*Unfair Value / Rejection*), chúng ta cần chiều không gian thứ 3: **Sự phân phối theo chiều ngang (Horizontal Distribution)**.

```
       Mô Hình Đấu Giá Chuông Gaussian (Bell Curve)
                  [ VAH: Value Area High ]
                        /          \
                       /   Value    \
                      /    Area      \
             POC --->|     (70%)      | <--- Fair Value / Nam châm hút giá
                      \              /
                       \            /
                        \          /
                  [ VAL: Value Area Low ]
```

* **Volume Profile:** Đo lường **Khối lượng tiền/hợp đồng (Volume)** khớp tại mỗi mức giá.
* **TPO (Time Price Opportunity):** Đo lường **Thời gian (Time)** giá lưu lại tại mỗi mức giá.

---

## 2. Volume Profile (Hồ Sơ Khối Lượng)

### 2.1. Cấu trúc dữ liệu & Thuật toán

Module được xây dựng tại [`src/engine/volume-profile.ts`](file:///c:/Users/Admin/Downloads/Indicators/Bot/src/engine/volume-profile.ts).

#### Bước 1: Chia Bậc Giá (Price Bins)
Tìm giá cao nhất ($P_{\max}$) và thấp nhất ($P_{\min}$) trong tập nến đang xét. Chia khoảng này thành $N$ bậc giá (mặc định $N = 45 - 60$ bins):
$$\text{Bin Size} = \frac{P_{\max} - P_{\min}}{N}$$
Mỗi bin $i$ đại diện cho khoảng giá:
$$[\text{PriceLow}_i, \text{PriceHigh}_i] = [P_{\min} + i \times \text{Bin Size}, P_{\min} + (i+1) \times \text{Bin Size}]$$

#### Bước 2: Phân phối Volume của từng cây nến
Với mỗi cây nến có khoảng biến động $[Low, High]$ và tổng khối lượng $V$:
* Xác định các bin mà cây nến này bao phủ từ index $Start$ đến $End$.
* Khối lượng mỗi bin nhận được:
  $$V_{\text{bin}} = \frac{V}{End - Start + 1}$$
* Ước tính **Buy/Sell Delta Volume**: Nến tăng ($Close \ge Open$) phân bổ 65% Buy Volume, nến giảm phân bổ 65% Sell Volume.

#### Bước 3: Xác định VPOC (Volume Point of Control)
Bin có tổng volume lớn nhất:
$$\text{VPOC} = \arg\max_{i} (V_i)$$

#### Bước 4: Thuật toán mở rộng Value Area (VA 70%)
Chuẩn quốc tế quy định Value Area bao gồm **70%** (xấp xỉ 1 độ lệch chuẩn $\pm 1\sigma$) tổng khối lượng giao dịch.
Thuật toán mở rộng 2 hướng từ VPOC:
1. Bắt đầu tại $\text{Index}_{\text{POC}}$, khởi tạo $V_{\text{VA}} = V_{\text{POC}}$.
2. So sánh tổng volume của 2 bin liền kề: Bin phía trên ($\text{Index} + 1$) và Bin phía dưới ($\text{Index} - 1$).
3. Bổ sung bin có khối lượng lớn hơn vào Value Area và cộng dồn volume.
4. Lặp lại cho đến khi:
   $$V_{\text{VA}} \ge 70\% \times V_{\text{total}}$$
5. Mép trên cùng của các bin được chọn là **VAH (Value Area High)**, mép dưới cùng là **VAL (Value Area Low)**.

#### Bước 5: Phát hiện HVN và LVN
* **HVN (High Volume Node):** Các đỉnh nhô ra của histogram (nhiều hơn 1.35x trung bình các bin lân cận) $\rightarrow$ Đóng vai trò là vùng hỗ trợ/kháng cự cứng.
* **LVN (Low Volume Node):** Các đáy trũng sâu của histogram (ít hơn 0.65x trung bình các bin lân cận) $\rightarrow$ Khoảng trống thanh khoản (tương đương FVG trong ICT), giá sẽ lao qua rất nhanh.

---

## 3. TPO Market Profile (Time Price Opportunity)

### 3.1. Cấu trúc dữ liệu & Thuật toán

Module được xây dựng tại [`src/engine/tpo-profile.ts`](file:///c:/Users/Admin/Downloads/Indicators/Bot/src/engine/tpo-profile.ts).

#### Bước 1: Phân bổ chữ cái theo chu kỳ 30 phút (TPO Periods)
Mỗi phiên giao dịch được chia thành các chu kỳ thời gian (mặc định 30 phút). Mỗi chu kỳ được gán một ký tự chữ cái theo thứ tự bảng chữ cái:
$$\text{TPO\_LETTERS} = ['A', 'B', 'C', 'D', 'E', \dots, 'Z', 'a', 'b', \dots]$$
* **Block A:** 30 phút đầu tiên của phiên.
* **Block B:** 30 phút thứ hai của phiên.
* **Block C:** 30 phút thứ ba...

#### Bước 2: Initial Balance (IB)
Biên độ dao động của 1 giờ đầu tiên mở phiên (Chu kỳ A và B):
$$\text{IB High} = \max(High_A, High_B)$$
$$\text{IB Low} = \min(Low_A, Low_B)$$
$$\text{IB Range} = \text{IB High} - \text{IB Low}$$
*Nếu giá bứt phá ra ngoài IB với lực mạnh, phiên đó có xác suất 80% trở thành **Trend Day**.*

#### Bước 3: Ma trận TPO & TPOC (Time POC)
* Mỗi bậc giá mà nến trong chu kỳ chạm tới sẽ được in chữ cái tương ứng.
* Tổng số chữ cái tại một bậc giá gọi là **TPO Count**.
* Bậc giá có số lượng chữ cái nhiều nhất chính là **TPOC (Time Point of Control)** — mức giá thị trường dừng lại trao đổi lâu nhất.

#### Bước 4: Nhận diện bất thường cấu trúc (Anomalies)

##### 1. Single Prints (Dấu chân cô độc)
* Là mức giá ở **thân giữa profile** chỉ có đúng **1 chữ cái TPO duy nhất**.
* **Ý nghĩa:** Cá mập đẩy giá một mạch qua vùng này mà không dừng lại đấu giá (*Displacement*). Trong tương lai, đây là vùng mất cân bằng thanh khoản bắt buộc giá phải quay lại lấp (tương đương FVG).

##### 2. Poor High / Poor Low (Đỉnh/Đáy nghèo nàn)
* Khi đỉnh cao nhất hoặc đáy thấp nhất của phiên có **từ 2 chữ cái TPO trở lên** xếp bằng phẳng (không có râu nhọn *Excess Tail* 1 chữ cái nhô ra).
* **Ý nghĩa:** Cuộc đấu giá tại đỉnh/đáy bị cắt ngang đột ngột, chưa hoàn thành việc từ chối giá. Trong ICT, đây chính là **Equal Highs / Equal Lows (BSL/SSL)** $\rightarrow$ **90% giá sẽ quay lại quét râu (Liquidity Sweep)** qua mức này!

#### Bước 5: Phân loại hình thái Profile (Profile Shapes)
1. **Normal / D-shape (Hình chuông chuẩn):** Thị trường cân bằng, phân phối đối xứng quanh POC.
2. **Trend Day (Elongated Profile):** Biên độ phiên lớn gấp > 2.2 lần IB Range, profile kéo dài thành một dải hẹp.
3. **P-shape:** TPOC và Value Area nằm dồn ở nửa trên, phía dưới có chân dài $\rightarrow$ Thường là dấu hiệu Short Covering hoặc phe Mua đẩy giá áp đảo.
4. **b-shape:** TPOC và Value Area nằm dồn ở nửa dưới, phía trên có râu dài $\rightarrow$ Dấu hiệu Long Liquidation hoặc phe Bán xả hàng mạnh.
5. **Double Distribution:** Profile có 2 khối Value Area phình to riêng biệt, ngăn cách ở giữa bởi một dải Single Prints.

---

## 4. Giao Diện Chuẩn TradingView Trên Dashboard

### 4.1. Lớp phủ Volume Profile (VRVP) trên Candlestick Chart
Xem mã nguồn tại [`src/components/CandlestickChart.tsx`](file:///c:/Users/Admin/Downloads/Indicators/Bot/src/components/CandlestickChart.tsx):
* **Thiết kế Dual-Color chuẩn TradingView:**
  * Mỗi thanh bar được tách thành 2 mảng màu: **Xanh ngọc `#26a69a` (Buy / Up Volume)** và **Đỏ san hô `#ef5350` (Sell / Down Volume)**.
  * Các thanh trong **Value Area (70%)** sáng màu; các thanh ngoài Value Area mờ tối tự nhiên.
* **Tùy chọn vị trí linh hoạt (R / L):**
  * Nút chuyển đổi **`R` (Bên Phải - Mặc định TradingView)** hoặc **`L` (Bên Trái)** ngay trên thanh công cụ.
* **Đường đỏ Point of Control (POC):**
  * Kéo dài ngang toàn bộ màn hình màu đỏ rực `#ef5350`, có huy hiệu `POC $3986.5` sắc nét ở mép thước giá.
* **Đường nét đứt VAH & VAL:**
  * Hai đường màu xanh dương `#38bdf8` đánh dấu trần và sàn của Value Area 70%.

### 4.2. Biểu đồ Đồ Hoạ TPO Market Profile
Xem mã nguồn tại [`src/components/TPOChart.tsx`](file:///c:/Users/Admin/Downloads/Indicators/Bot/src/components/TPOChart.tsx):
* **Vẽ trực tiếp trên Canvas đồ hoạ cao cấp (High-DPI Canvas):**
  * Không dùng bảng văn bản thô, toàn bộ TPO được render mượt mà bằng Canvas.
* **Bảng màu Gradient theo thời gian (Time Heatmap):**
  * Block `A - C` (Mở phiên sáng): Xanh dương / Indigo `#2563eb`
  * Block `D - F` (Giữa phiên): Xanh ngọc / Emerald `#10b981`
  * Block `G - I` (Chiều): Vàng chanh / Hổ phách `#eab308`
  * Block `J+` (Đóng phiên): Cam / Đỏ san hô `#ea580c`
* **Ngoặc Initial Balance `[ IB ]`:**
  * Thanh ngoặc màu cyan bao trọn 2 chu kỳ đầu A & B, hiển thị rõ biên độ 1 giờ đầu tiên.
* **Khung mờ Value Area:**
  * Vùng xanh dương mờ bao trọn 70% TPO từ VAL đến VAH.
* **Chế độ xem linh hoạt:**
  * **Collapsed:** Dồn các chữ cái thành hình quả chuông nén Market Profile chuẩn.
  * **Split:** Tách từng cột chữ cái A, B, C theo timeline ngang của phiên.
  * **Dual Volume Profile:** Cột Volume Profile 2 màu đặt song song bên cạnh ma trận TPO.
* **Interactive Tooltip Inspector:**
  * Rê chuột đến bất kỳ mức giá nào sẽ hiện bảng chi tiết: TPO Count, các chữ cái chu kỳ, và khối lượng lot đã khớp.

---

## 5. Chiến Lược Giao Dịch Thực Chiến: Kết Hợp TPO/Volume Profile với ICT

### Setup 1: Value Area Reversal (Sweep VAH/VAL $\rightarrow$ MSS)
1. Giá mở phiên bên trong Value Area của phiên trước.
2. Giá tăng vọt phá thủng lên trên **VAH** (quét thanh khoản Buy-side Liquidity).
3. Tuy nhiên, giá bị từ chối và xuất hiện nến đóng cửa chui ngược lại vào trong Value Area.
4. 👉 **Action:** Vào lệnh **SHORT**, mục tiêu chốt lời (TP) tại **POC** hoặc mép đối diện **VAL**.

### Setup 2: Poor High / Poor Low Liquidity Sweep
1. Trong tab TPO, phát hiện phiên hôm trước có huy hiệu **`⚠️ Poor High (BSL)`** (đỉnh bằng phẳng $\ge 2$ TPO).
2. Phiên hôm nay giá tiến tới vùng Poor High này.
3. Chờ đợi cây nến quét râu qua đỉnh Poor High (Liquidity Sweep) và tạo **MSS** đảo chiều.
4. 👉 **Action:** Bắt trọn con sóng đảo chiều với tỷ lệ R:R cao vì các trader đu mua breakout tại Poor High đã bị sập bẫy (*Trap Traders*).

### Setup 3: Single Prints Rebalance (Lấp khoảng trống)
1. Phiên xuất hiện dải Single Prints (chỉ có 1 chữ cái) do tin tức đẩy giá quá nhanh.
2. Khi phiên tiếp theo mở cửa, giá quay về test dải Single Prints này.
3. Single Prints hoạt động như một vùng đệm hỗ trợ/kháng cự cực mạnh (tương đương 50% FVG trong ICT).
4. 👉 **Action:** Đặt lệnh đón Limit tại mép Single Prints theo chiều xu hướng chính.

---

## 6. Sơ Đồ Cấu Trúc Mã Nguồn

```
Bot/
├── docs/
│   └── TPO_AND_VOLUME_PROFILE.md      # Tài liệu kỹ thuật chi tiết (file này)
├── src/
│   ├── engine/
│   │   ├── volume-profile.ts          # Thuật toán tính Bins, VPOC, VA 70%, HVN/LVN
│   │   ├── tpo-profile.ts             # Thuật toán TPO Letters, TPOC, IB, Poor High/Low, Single Prints
│   │   ├── fvg.ts                     # Thuật toán nhận diện FVG & BAG
│   │   └── simulator.ts               # Bộ máy mô phỏng backtest
│   ├── components/
│   │   ├── CandlestickChart.tsx       # Chart nến + Canvas Overlay vẽ FVG/BAG + Volume Profile
│   │   ├── TPOChart.tsx               # Giao diện TPO Profile chuyên sâu (Collapsed/Split/Dual)
│   │   └── ControlBar.tsx             # Thanh điều khiển (Cặp tiền, Khung giờ, Live Sync)
│   ├── lib/
│   │   └── market-data.ts             # Feed dữ liệu realtime XAU (Bybit), US100/US500 (Yahoo)
│   └── app/
│       └── page.tsx                   # Trang Dashboard chính (3 Tabs: Candles, TPO, Equity)
```
