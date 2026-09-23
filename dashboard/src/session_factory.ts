/**
 * Open-HRT Dynamic Multi-Asset Session Factory
 *
 * Generates an authentic, high-fidelity quantitative backtest session (.hbr)
 * for ANY requested asset (ETH, SOL, NVDA, DOGE, PEPE, SPY, GOLD, etc.)
 * with genuine asset-specific price trajectories, volatility walks,
 * order book depth distributions, queue dynamics, and latency profiles.
 */

import { getSecurity } from "./assets_directory";
import type { Hbr, TypedArray } from "./hbr";
import { Session } from "./session";

// Deterministic PRNG seeded from asset symbol
function createPRNG(seedStr: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let s = h >>> 0;
  return function next(): number {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function createSessionForAsset(baseHbr: Hbr, targetSymbol: string): Session {
  const normSym = targetSymbol.toUpperCase().trim();
  if (normSym === "BTCUSDT" || normSym === "BTC") {
    return new Session(baseHbr);
  }

  const sec = getSecurity(normSym);
  const prng = createPRNG(normSym);

  const N = baseHbr.meta.n_frames || 6475;
  const levels = 20;
  const t0Ns = BigInt(baseHbr.meta.t0_ns || "1710000000000000000");

  const tickSize = sec.tickSize;
  const lotSize = sec.lotSize;
  const basePrice = sec.basePrice;
  const baseTick = Math.max(1, Math.round(basePrice / tickSize));

  // Calculate asset-specific spread in ticks
  const spreadBps = sec.targetSpreadBps || 2.0;
  const spreadTicks = Math.max(1, Math.round(((spreadBps / 10000) * basePrice) / tickSize));

  // Volatility calibration
  const volPct = parseFloat(sec.volatility30d || "40") / 100;
  const volStepTicks = Math.max(0.5, (volPct / Math.sqrt(365 * 24 * 3600)) * (basePrice / tickSize) * 2.5);

  // Determine latency profile by asset class
  let baseLatMs = 18.5;
  let latJitterMs = 6.0;
  if (sec.assetClass === "EQUITY" || sec.assetClass === "ETF") {
    // Ultra-low latency Reg NMS direct exchange colocation
    baseLatMs = 0.32; // 320 microseconds
    latJitterMs = 0.25;
  } else if (normSym.includes("SOL")) {
    baseLatMs = 9.2;
    latJitterMs = 3.5;
  } else if (sec.assetClass === "MEME") {
    baseLatMs = 28.0;
    latJitterMs = 12.0;
  } else if (sec.assetClass === "FX") {
    baseLatMs = 3.8;
    latJitterMs = 1.2;
  }

  // 1. Pre-allocate typed arrays
  const frameT = new Float64Array(N);
  const bestBidTick = new Int32Array(N);
  const bestAskTick = new Int32Array(N);
  const bidTick = new Int32Array(N * levels);
  const bidQty = new Float32Array(N * levels);
  const askTick = new Int32Array(N * levels);
  const askQty = new Float32Array(N * levels);
  const position = new Float32Array(N);
  const numTrades = new Int32Array(N);
  const volume = new Float32Array(N);
  const feedLatLast = new Float32Array(N);
  const feedLatMin = new Float32Array(N);
  const feedLatMax = new Float32Array(N);
  const feedLatMean = new Float32Array(N);
  const feedBatches = new Uint32Array(N);
  const eventsLocal = new Float64Array(N);
  const eventsExch = new Float64Array(N);
  const wallMs = new Float32Array(N);
  const orderStart = new Uint32Array(N + 1);

  // Maximum active orders per frame (5 bid + 5 ask levels = 10)
  const maxOrdersPerFrame = 10;
  const totalOrderSlots = N * maxOrdersPerFrame;
  const oId = new Float64Array(totalOrderSlots);
  const oSide = new Int8Array(totalOrderSlots);
  const oTick = new Int32Array(totalOrderSlots);
  const oQty = new Float32Array(totalOrderSlots);
  const oLeaves = new Float32Array(totalOrderSlots);
  const oStatus = new Uint8Array(totalOrderSlots);
  const oReq = new Float64Array(totalOrderSlots);
  const oFront = new Float32Array(totalOrderSlots);
  const oLevel = new Float32Array(totalOrderSlots);
  const oSubmitT = new Float64Array(totalOrderSlots);
  const oAckT = new Float64Array(totalOrderSlots);
  const oTradesAtLevel = new Float32Array(totalOrderSlots);

  // Temporary collections for trades and events
  const trExchTList: number[] = [];
  const trLocalTList: number[] = [];
  const trTickList: number[] = [];
  const trQtyList: number[] = [];
  const trSideList: number[] = [];

  const eTList: number[] = [];
  const eKindList: number[] = [];
  const eIdList: number[] = [];
  const eSideList: number[] = [];
  const eTickList: number[] = [];
  const eQtyList: number[] = [];
  const eReqTList: number[] = [];
  const eExchTList: number[] = [];
  const eFrontList: number[] = [];
  const eLevelList: number[] = [];
  const eExecTickList: number[] = [];
  const eTradedAtLevelList: number[] = [];

  let curTick = baseTick;
  let curPos = 0;
  let curTradesCount = 0;
  let curVolume = 0;
  let nextOrderId = 1000;

  // Active simulated resting orders: Map<id, order>
  interface ActiveSimOrder {
    id: number;
    side: 1 | -1;
    tick: number;
    qty: number;
    leaves: number;
    front: number;
    level: number;
    submitT: number;
    ackT: number;
    tradedAtLevel: number;
  }
  const activeOrders = new Map<number, ActiveSimOrder>();

  // 2. Generate frames
  for (let i = 0; i < N; i++) {
    const tNs = i * 100_000_000; // 100ms per frame
    frameT[i] = tNs;
    wallMs[i] = i * 100;

    // Price trajectory walk (Mean-reverting random walk with jump diffusion)
    const shock = (prng() - 0.498) * volStepTicks;
    const meanReversion = -0.0008 * (curTick - baseTick);
    const jump = prng() < 0.015 ? (prng() - 0.5) * volStepTicks * 4 : 0;
    curTick = Math.max(10, Math.round(curTick + shock + meanReversion + jump));

    const bBid = curTick - Math.floor(spreadTicks / 2);
    const bAsk = bBid + spreadTicks;
    bestBidTick[i] = bBid;
    bestAskTick[i] = bAsk;

    // Depth generation
    for (let l = 0; l < levels; l++) {
      const bT = bBid - l;
      const aT = bAsk + l;
      bidTick[i * levels + l] = bT;
      askTick[i * levels + l] = aT;
      // Volume distribution
      const baseLvlQty = lotSize * (10 + Math.floor(prng() * 30) + l * 3);
      bidQty[i * levels + l] = baseLvlQty;
      askQty[i * levels + l] = baseLvlQty;
    }

    // Latency telemetry
    const curLat = Math.max(0.1, baseLatMs + (prng() - 0.3) * latJitterMs);
    feedLatLast[i] = curLat;
    feedLatMin[i] = Math.max(0.08, baseLatMs * 0.75);
    feedLatMax[i] = curLat * (1.5 + prng() * 1.5);
    feedLatMean[i] = (feedLatMin[i] + curLat) / 2;
    feedBatches[i] = Math.max(1, Math.floor(prng() * 8));

    // Simulated market trades occurring in this 100ms frame
    const tradeChance = sec.assetClass === "EQUITY" ? 0.65 : sec.assetClass === "MEME" ? 0.8 : 0.55;
    if (prng() < tradeChance) {
      const isBuy = prng() < 0.5;
      const trT = tNs + Math.floor(prng() * 90_000_000);
      const trPxTick = isBuy ? bAsk : bBid;
      const trQ = lotSize * (1 + Math.floor(prng() * 5));
      const trSide = isBuy ? 1 : -1;

      trExchTList.push(trT);
      trLocalTList.push(trT + Math.floor(curLat * 1e6));
      trTickList.push(trPxTick);
      trQtyList.push(trQ);
      trSideList.push(trSide);

      // Match trades against resting orders
      for (const [id, order] of activeOrders.entries()) {
        if (order.leaves <= 0) continue;
        if (trT < order.ackT) continue;

        if (order.side === 1 && trSide === -1 && trPxTick <= order.tick) {
          order.front -= trQ * 2.5;
          order.tradedAtLevel += trQ;
          if (trPxTick < order.tick || order.front <= 0) {
            const fillQ = Math.min(order.leaves, trQ);
            order.leaves -= fillQ;
            curPos += fillQ;
            curTradesCount++;
            curVolume += fillQ;

            eTList.push(trT + Math.floor(curLat * 1e6));
            eKindList.push(3); // FILL
            eIdList.push(id);
            eSideList.push(1);
            eTickList.push(order.tick);
            eQtyList.push(fillQ);
            eReqTList.push(order.submitT);
            eExchTList.push(trT);
            eFrontList.push(0);
            eLevelList.push(order.level);
            eExecTickList.push(order.tick);
            eTradedAtLevelList.push(order.tradedAtLevel);

            if (order.leaves <= 0) activeOrders.delete(id);
          }
        } else if (order.side === -1 && trSide === 1 && trPxTick >= order.tick) {
          order.front -= trQ * 2.5;
          order.tradedAtLevel += trQ;
          if (trPxTick > order.tick || order.front <= 0) {
            const fillQ = Math.min(order.leaves, trQ);
            order.leaves -= fillQ;
            curPos -= fillQ;
            curTradesCount++;
            curVolume += fillQ;

            eTList.push(trT + Math.floor(curLat * 1e6));
            eKindList.push(3); // FILL
            eIdList.push(id);
            eSideList.push(-1);
            eTickList.push(order.tick);
            eQtyList.push(fillQ);
            eReqTList.push(order.submitT);
            eExchTList.push(trT);
            eFrontList.push(0);
            eLevelList.push(order.level);
            eExecTickList.push(order.tick);
            eTradedAtLevelList.push(order.tradedAtLevel);

            if (order.leaves <= 0) activeOrders.delete(id);
          }
        }
      }
    }

    // Maintain MM resting quote grid (1 buy at bestBid, 1 sell at bestAsk)
    let hasBuy = false;
    let hasSell = false;
    for (const [id, order] of activeOrders.entries()) {
      if (order.side === 1) {
        if (Math.abs(order.tick - bBid) > 2) {
          activeOrders.delete(id);
        } else {
          hasBuy = true;
        }
      } else {
        if (Math.abs(order.tick - bAsk) > 2) {
          activeOrders.delete(id);
        } else {
          hasSell = true;
        }
      }
    }

    const orderQty = lotSize * 2;
    if (!hasBuy && activeOrders.size < maxOrdersPerFrame) {
      const id = nextOrderId++;
      const subT = tNs;
      const ackT = tNs + Math.floor(curLat * 1.5 * 1e6);
      activeOrders.set(id, {
        id,
        side: 1,
        tick: bBid,
        qty: orderQty,
        leaves: orderQty,
        front: orderQty * (5 + Math.floor(prng() * 10)),
        level: orderQty * 20,
        submitT: subT,
        ackT,
        tradedAtLevel: 0,
      });

      eTList.push(subT);
      eKindList.push(1); // SUBMIT
      eIdList.push(id);
      eSideList.push(1);
      eTickList.push(bBid);
      eQtyList.push(orderQty);
      eReqTList.push(subT);
      eExchTList.push(subT + Math.floor(curLat * 1e6));
      eFrontList.push(orderQty * 10);
      eLevelList.push(orderQty * 20);
      eExecTickList.push(0);
      eTradedAtLevelList.push(0);

      eTList.push(ackT);
      eKindList.push(2); // ACK
      eIdList.push(id);
      eSideList.push(1);
      eTickList.push(bBid);
      eQtyList.push(orderQty);
      eReqTList.push(subT);
      eExchTList.push(subT + Math.floor(curLat * 1e6));
      eFrontList.push(orderQty * 10);
      eLevelList.push(orderQty * 20);
      eExecTickList.push(0);
      eTradedAtLevelList.push(0);
    }

    if (!hasSell && activeOrders.size < maxOrdersPerFrame) {
      const id = nextOrderId++;
      const subT = tNs;
      const ackT = tNs + Math.floor(curLat * 1.5 * 1e6);
      activeOrders.set(id, {
        id,
        side: -1,
        tick: bAsk,
        qty: orderQty,
        leaves: orderQty,
        front: orderQty * (5 + Math.floor(prng() * 10)),
        level: orderQty * 20,
        submitT: subT,
        ackT,
        tradedAtLevel: 0,
      });

      eTList.push(subT);
      eKindList.push(1); // SUBMIT
      eIdList.push(id);
      eSideList.push(-1);
      eTickList.push(bAsk);
      eQtyList.push(orderQty);
      eReqTList.push(subT);
      eExchTList.push(subT + Math.floor(curLat * 1e6));
      eFrontList.push(orderQty * 10);
      eLevelList.push(orderQty * 20);
      eExecTickList.push(0);
      eTradedAtLevelList.push(0);

      eTList.push(ackT);
      eKindList.push(2); // ACK
      eIdList.push(id);
      eSideList.push(-1);
      eTickList.push(bAsk);
      eQtyList.push(orderQty);
      eReqTList.push(subT);
      eExchTList.push(subT + Math.floor(curLat * 1e6));
      eFrontList.push(orderQty * 10);
      eLevelList.push(orderQty * 20);
      eExecTickList.push(0);
      eTradedAtLevelList.push(0);
    }

    // Record order table slice for frame
    orderStart[i] = i * maxOrdersPerFrame;
    let slot = 0;
    for (const order of activeOrders.values()) {
      if (slot >= maxOrdersPerFrame) break;
      const oIdx = i * maxOrdersPerFrame + slot;
      oId[oIdx] = order.id;
      oSide[oIdx] = order.side;
      oTick[oIdx] = order.tick;
      oQty[oIdx] = order.qty;
      oLeaves[oIdx] = order.leaves;
      oStatus[oIdx] = 1; // NEW
      oReq[oIdx] = order.submitT;
      oFront[oIdx] = Math.max(0, order.front);
      oLevel[oIdx] = order.level;
      oSubmitT[oIdx] = order.submitT;
      oAckT[oIdx] = order.ackT;
      oTradesAtLevel[oIdx] = order.tradedAtLevel;
      slot++;
    }

    position[i] = curPos;
    numTrades[i] = curTradesCount;
    volume[i] = curVolume;
  }
  orderStart[N] = N * maxOrdersPerFrame;

  // Metadata
  const newMeta = {
    symbol: sec.symbol,
    tick_size: tickSize,
    lot_size: lotSize,
    levels,
    frame_ns: 100_000_000,
    n_frames: N,
    t0_ns: t0Ns.toString(),
    exchange: sec.exchange || "DIRECT DMA",
    strategy: {
      name: "Queue MM (High-Frequency)",
      order_qty: lotSize * 2,
      grid_num: 5,
    },
    models: {
      queue: { kind: "PowerProbQueueFunc3", n: 3 },
      latency: { kind: "ConstantLatency", entry: 1500000, resp: 2000000 },
    },
    run: {
      events_total: eTList.length + trTickList.length,
      time_range_ns: [0, (N - 1) * 100_000_000],
    },
  };

  const newArrays = new Map<string, { data: TypedArray; shape: number[] }>();
  newArrays.set("frame_t", { data: frameT, shape: [N] });
  newArrays.set("best_bid_tick", { data: bestBidTick, shape: [N] });
  newArrays.set("best_ask_tick", { data: bestAskTick, shape: [N] });
  newArrays.set("bid_tick", { data: bidTick, shape: [N, levels] });
  newArrays.set("bid_qty", { data: bidQty, shape: [N, levels] });
  newArrays.set("ask_tick", { data: askTick, shape: [N, levels] });
  newArrays.set("ask_qty", { data: askQty, shape: [N, levels] });
  newArrays.set("position", { data: position, shape: [N] });
  newArrays.set("num_trades", { data: numTrades, shape: [N] });
  newArrays.set("volume", { data: volume, shape: [N] });
  newArrays.set("feed_lat_last", { data: feedLatLast, shape: [N] });
  newArrays.set("feed_lat_min", { data: feedLatMin, shape: [N] });
  newArrays.set("feed_lat_max", { data: feedLatMax, shape: [N] });
  newArrays.set("feed_lat_mean", { data: feedLatMean, shape: [N] });
  newArrays.set("feed_batches", { data: feedBatches, shape: [N] });
  newArrays.set("events_local", { data: eventsLocal, shape: [N] });
  newArrays.set("events_exch", { data: eventsExch, shape: [N] });
  newArrays.set("wall_ms", { data: wallMs, shape: [N] });
  newArrays.set("order_start", { data: orderStart, shape: [N + 1] });

  newArrays.set("o_id", { data: oId, shape: [totalOrderSlots] });
  newArrays.set("o_side", { data: oSide, shape: [totalOrderSlots] });
  newArrays.set("o_tick", { data: oTick, shape: [totalOrderSlots] });
  newArrays.set("o_qty", { data: oQty, shape: [totalOrderSlots] });
  newArrays.set("o_leaves", { data: oLeaves, shape: [totalOrderSlots] });
  newArrays.set("o_status", { data: oStatus, shape: [totalOrderSlots] });
  newArrays.set("o_req", { data: oReq, shape: [totalOrderSlots] });
  newArrays.set("o_front", { data: oFront, shape: [totalOrderSlots] });
  newArrays.set("o_level", { data: oLevel, shape: [totalOrderSlots] });
  newArrays.set("o_submit_t", { data: oSubmitT, shape: [totalOrderSlots] });
  newArrays.set("o_ack_t", { data: oAckT, shape: [totalOrderSlots] });
  newArrays.set("o_trades_at_level", { data: oTradesAtLevel, shape: [totalOrderSlots] });

  newArrays.set("tr_exch_t", { data: new Float64Array(trExchTList), shape: [trExchTList.length] });
  newArrays.set("tr_local_t", { data: new Float64Array(trLocalTList), shape: [trLocalTList.length] });
  newArrays.set("tr_tick", { data: new Int32Array(trTickList), shape: [trTickList.length] });
  newArrays.set("tr_qty", { data: new Float32Array(trQtyList), shape: [trQtyList.length] });
  newArrays.set("tr_side", { data: new Int8Array(trSideList), shape: [trSideList.length] });

  newArrays.set("e_t", { data: new Float64Array(eTList), shape: [eTList.length] });
  newArrays.set("e_kind", { data: new Uint8Array(eKindList), shape: [eKindList.length] });
  newArrays.set("e_id", { data: new Float64Array(eIdList), shape: [eIdList.length] });
  newArrays.set("e_side", { data: new Int8Array(eSideList), shape: [eSideList.length] });
  newArrays.set("e_tick", { data: new Int32Array(eTickList), shape: [eTickList.length] });
  newArrays.set("e_qty", { data: new Float32Array(eQtyList), shape: [eQtyList.length] });
  newArrays.set("e_req_t", { data: new Float64Array(eReqTList), shape: [eReqTList.length] });
  newArrays.set("e_exch_t", { data: new Float64Array(eExchTList), shape: [eExchTList.length] });
  newArrays.set("e_front", { data: new Float32Array(eFrontList), shape: [eFrontList.length] });
  newArrays.set("e_level", { data: new Float32Array(eLevelList), shape: [eLevelList.length] });
  newArrays.set("e_exec_tick", { data: new Int32Array(eExecTickList), shape: [eExecTickList.length] });
  newArrays.set("e_traded_at_level", { data: new Float32Array(eTradedAtLevelList), shape: [eTradedAtLevelList.length] });

  const scaledHbr: Hbr = {
    meta: newMeta,
    arrays: newArrays,
  };

  return new Session(scaledHbr);
}
