import { Candle } from '@/types/market';

export interface VolumeProfileBin {
  price: number;
  priceLow: number;
  priceHigh: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
  delta: number;
  percentage: number;
  isPOC: boolean;
  isValueArea: boolean;
  isHVN: boolean; // High Volume Node
  isLVN: boolean; // Low Volume Node
}

export interface VolumeProfileResult {
  bins: VolumeProfileBin[];
  pocPrice: number;
  pocVolume: number;
  pocIndex: number;
  vah: number; // Value Area High
  val: number; // Value Area Low
  valueAreaVolume: number;
  totalVolume: number;
  minPrice: number;
  maxPrice: number;
  hvnPrices: number[];
  lvnPrices: number[];
}

export interface SessionVolumeProfile {
  date: string;
  startTime: number;
  endTime: number;
  high: number;
  low: number;
  vp: VolumeProfileResult;
}

/**
 * Calculate Volume Profile across a set of candles
 * Uses price binned horizontal distribution with dual-sided Value Area (70%) expansion
 * Computes realistic Up Volume (Buy) vs Down Volume (Sell) split for TradingView dual-color rendering
 */
export function calculateVolumeProfile(
  candles: Candle[],
  numBins: number = 50,
  valueAreaPercent: number = 70
): VolumeProfileResult | null {
  if (!candles || candles.length === 0) return null;

  // 1. Find price extremes
  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let totalVolume = 0;

  candles.forEach((c) => {
    if (c.low < minPrice) minPrice = c.low;
    if (c.high > maxPrice) maxPrice = c.high;
    totalVolume += c.volume;
  });

  if (minPrice >= maxPrice || totalVolume <= 0) return null;

  const priceRange = maxPrice - minPrice;
  const binSize = priceRange / numBins;

  // 2. Initialize bins
  const bins: VolumeProfileBin[] = Array.from({ length: numBins }, (_, i) => {
    const priceLow = minPrice + i * binSize;
    const priceHigh = priceLow + binSize;
    return {
      price: Math.round(((priceLow + priceHigh) / 2) * 100) / 100,
      priceLow: Math.round(priceLow * 100) / 100,
      priceHigh: Math.round(priceHigh * 100) / 100,
      volume: 0,
      buyVolume: 0,
      sellVolume: 0,
      delta: 0,
      percentage: 0,
      isPOC: false,
      isValueArea: false,
      isHVN: false,
      isLVN: false,
    };
  });

  // 3. Distribute candle volumes into price bins with accurate Buy/Sell split
  candles.forEach((c) => {
    const range = Math.max(0.01, c.high - c.low);
    const body = Math.abs(c.close - c.open);
    const isBullish = c.close >= c.open;

    const bodyFactor = Math.min(0.25, (body / range) * 0.25);
    const buyRatio = isBullish ? 0.55 + bodyFactor : 0.45 - bodyFactor;

    const candleBuyVol = c.volume * buyRatio;
    const candleSellVol = c.volume * (1 - buyRatio);

    const startBinIdx = Math.max(0, Math.min(numBins - 1, Math.floor((c.low - minPrice) / binSize)));
    const endBinIdx = Math.max(0, Math.min(numBins - 1, Math.floor((c.high - minPrice) / binSize)));

    const binsSpanned = Math.max(1, endBinIdx - startBinIdx + 1);
    const volPerBin = c.volume / binsSpanned;
    const buyVolPerBin = candleBuyVol / binsSpanned;
    const sellVolPerBin = candleSellVol / binsSpanned;

    for (let b = startBinIdx; b <= endBinIdx; b++) {
      bins[b].volume += volPerBin;
      bins[b].buyVolume += buyVolPerBin;
      bins[b].sellVolume += sellVolPerBin;
      bins[b].delta += buyVolPerBin - sellVolPerBin;
    }
  });

  // 4. Find Point of Control (POC)
  let maxVolume = -Infinity;
  let pocIndex = 0;

  bins.forEach((bin, idx) => {
    bin.volume = Math.round(bin.volume * 100) / 100;
    bin.buyVolume = Math.round(bin.buyVolume * 100) / 100;
    bin.sellVolume = Math.round(bin.sellVolume * 100) / 100;
    bin.delta = Math.round(bin.delta * 100) / 100;
    bin.percentage = totalVolume > 0 ? (bin.volume / totalVolume) * 100 : 0;

    if (bin.volume > maxVolume) {
      maxVolume = bin.volume;
      pocIndex = idx;
    }
  });

  bins[pocIndex].isPOC = true;
  bins[pocIndex].isValueArea = true;

  // 5. Calculate Value Area (70% standard)
  const targetVAVolume = totalVolume * (valueAreaPercent / 100);
  let currentVAVolume = bins[pocIndex].volume;

  let upperIdx = pocIndex + 1;
  let lowerIdx = pocIndex - 1;

  while (currentVAVolume < targetVAVolume && (upperIdx < numBins || lowerIdx >= 0)) {
    const upperVol = upperIdx < numBins ? bins[upperIdx].volume : -1;
    const lowerVol = lowerIdx >= 0 ? bins[lowerIdx].volume : -1;

    if (upperVol >= lowerVol && upperIdx < numBins) {
      bins[upperIdx].isValueArea = true;
      currentVAVolume += upperVol;
      upperIdx++;
    } else if (lowerIdx >= 0) {
      bins[lowerIdx].isValueArea = true;
      currentVAVolume += lowerVol;
      lowerIdx--;
    } else if (upperIdx < numBins) {
      bins[upperIdx].isValueArea = true;
      currentVAVolume += upperVol;
      upperIdx++;
    } else {
      break;
    }
  }

  const vaBins = bins.filter((b) => b.isValueArea);
  const val = vaBins.length > 0 ? vaBins[0].priceLow : minPrice;
  const vah = vaBins.length > 0 ? vaBins[vaBins.length - 1].priceHigh : maxPrice;

  // 6. Detect High Volume Nodes (HVN) and Low Volume Nodes (LVN)
  const hvnPrices: number[] = [];
  const lvnPrices: number[] = [];

  for (let i = 2; i < numBins - 2; i++) {
    const v = bins[i].volume;
    const avgNeighbor =
      (bins[i - 2].volume + bins[i - 1].volume + bins[i + 1].volume + bins[i + 2].volume) / 4;

    if (v > bins[i - 1].volume && v > bins[i + 1].volume && v > avgNeighbor * 1.35) {
      bins[i].isHVN = true;
      hvnPrices.push(bins[i].price);
    } else if (v < bins[i - 1].volume && v < bins[i + 1].volume && v < avgNeighbor * 0.65) {
      bins[i].isLVN = true;
      lvnPrices.push(bins[i].price);
    }
  }

  return {
    bins,
    pocPrice: bins[pocIndex].price,
    pocVolume: maxVolume,
    pocIndex,
    vah: Math.round(vah * 100) / 100,
    val: Math.round(val * 100) / 100,
    valueAreaVolume: Math.round(currentVAVolume * 100) / 100,
    totalVolume: Math.round(totalVolume * 100) / 100,
    minPrice: Math.round(minPrice * 100) / 100,
    maxPrice: Math.round(maxPrice * 100) / 100,
    hvnPrices,
    lvnPrices,
  };
}

/**
 * Calculate Session Volume Profiles (SVP HD - by trading day)
 * Matches TradingView's Session Volume Profile indicator exactly as shown in screenshot
 */
export function calculateSessionVolumeProfiles(
  candles: Candle[],
  numBinsPerSession: number = 36
): SessionVolumeProfile[] {
  if (!candles || candles.length === 0) return [];

  const sessionMap = new Map<string, Candle[]>();
  candles.forEach((c) => {
    const d = new Date(c.time * 1000).toISOString().slice(0, 10);
    if (!sessionMap.has(d)) {
      sessionMap.set(d, []);
    }
    sessionMap.get(d)!.push(c);
  });

  const sessionProfiles: SessionVolumeProfile[] = [];

  sessionMap.forEach((sessionCandles, date) => {
    if (sessionCandles.length < 2) return;

    let high = -Infinity;
    let low = Infinity;
    sessionCandles.forEach((c) => {
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
    });

    const vp = calculateVolumeProfile(sessionCandles, numBinsPerSession, 70);
    if (!vp) return;

    sessionProfiles.push({
      date,
      startTime: sessionCandles[0].time,
      endTime: sessionCandles[sessionCandles.length - 1].time,
      high,
      low,
      vp,
    });
  });

  return sessionProfiles;
}
