/**
 * Open-HRT Dynamic Asset Backtest Session Factory
 *
 * Scales the baseline microstructural recording trajectory (.hbr)
 * to any requested crypto asset, memecoin, equity, commodity, ETF, or FX pair
 * using its calibrated price, tick size, lot size, spread, and order volume.
 */

import { getSecurity } from "./assets_directory";
import type { Hbr, TypedArray } from "./hbr";
import { Session } from "./session";

export function createSessionForAsset(baseHbr: Hbr, targetSymbol: string): Session {
  const sec = getSecurity(targetSymbol);
  const baseMeta = baseHbr.meta;

  const baseTickSize = Number(baseMeta.tick_size || 0.1);
  const baseLotSize = Number(baseMeta.lot_size || 0.001);

  // Determine reference base price from initial best bid
  const bestBidArr = baseHbr.arrays.get("best_bid_tick")?.data as Int32Array | undefined;
  const initialTick = bestBidArr && bestBidArr.length > 0 ? bestBidArr[0] : 616590;
  const refBasePrice = Math.max(1, initialTick * baseTickSize);

  const targetPrice = sec.basePrice;
  const targetTickSize = sec.tickSize;
  const targetLotSize = sec.lotSize;

  const priceScale = targetPrice / refBasePrice;
  const notionalTarget = refBasePrice * baseLotSize; // standard order notional
  const qtyScale = Math.max(0.0001, (notionalTarget / targetPrice) / baseLotSize);

  // Clone metadata
  const newMeta = JSON.parse(JSON.stringify(baseMeta));
  newMeta.symbol = sec.symbol;
  newMeta.tick_size = targetTickSize;
  newMeta.lot_size = targetLotSize;
  newMeta.exchange = sec.exchange || "DIRECT DMA";
  if (newMeta.strategy) {
    newMeta.strategy.order_qty = Number((newMeta.strategy.order_qty * qtyScale).toFixed(6));
  }

  // Helper to convert ticks
  const mapTick = (oldTick: number): number => {
    const rawPrice = oldTick * baseTickSize * priceScale;
    return Math.round(rawPrice / targetTickSize);
  };

  // Helper to convert quantities
  const mapQty = (oldQty: number): number => {
    return Math.max(targetLotSize, oldQty * qtyScale);
  };

  const newArrays = new Map<string, { data: TypedArray; shape: number[] }>();

  for (const [name, entry] of baseHbr.arrays.entries()) {
    const orig = entry.data;
    const shape = entry.shape;

    if (
      name === "best_bid_tick" ||
      name === "best_ask_tick" ||
      name === "bid_tick" ||
      name === "ask_tick" ||
      name === "o_tick" ||
      name === "tr_tick" ||
      name === "e_tick" ||
      name === "e_exec_tick"
    ) {
      const arr = new Int32Array(orig.length);
      for (let i = 0; i < orig.length; i++) {
        arr[i] = mapTick(orig[i]);
      }
      newArrays.set(name, { data: arr, shape });
    } else if (
      name === "bid_qty" ||
      name === "ask_qty" ||
      name === "position" ||
      name === "volume" ||
      name === "o_qty" ||
      name === "o_leaves" ||
      name === "o_front" ||
      name === "o_level" ||
      name === "tr_qty" ||
      name === "e_qty" ||
      name === "e_front" ||
      name === "e_level" ||
      name === "e_traded_at_level"
    ) {
      const arr = new Float32Array(orig.length);
      for (let i = 0; i < orig.length; i++) {
        arr[i] = mapQty(orig[i]);
      }
      newArrays.set(name, { data: arr, shape });
    } else {
      // Copy timing, flags, status unchanged
      newArrays.set(name, { data: orig.slice(), shape });
    }
  }

  const scaledHbr: Hbr = {
    meta: newMeta,
    arrays: newArrays,
  };

  return new Session(scaledHbr);
}

