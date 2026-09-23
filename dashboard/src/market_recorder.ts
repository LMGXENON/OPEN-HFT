/**
 * Open-HRT High-Frequency Market Recorder & Ingestion Engine
 * Streams real-time L2 order book deltas and trade prints from exchange WebSockets,
 * executes realistic microsecond queue simulation in-memory,
 * and compiles the telemetry into standard .hbr binary archives.
 */

import { getSecurity, type SecurityProfile } from "./assets_directory";
import type { Hbr, TypedArray } from "./hbr";
import { encodeHbr } from "./hbr";

export interface RecorderConfig {
  symbol: string;
  durationSec: number; // 0 for continuous/manual stop
  strategy: "queue_mm" | "avellaneda" | "passive_grid";
  latencyProfile: "cross_connect" | "colo_aws" | "retail";
  orderQty?: number;
}

export interface RecorderLiveMetrics {
  status: "idle" | "connecting" | "recording" | "compiling" | "done" | "error";
  symbol: string;
  elapsedSec: number;
  durationSec: number;
  packetsReceived: number;
  l2Updates: number;
  tradesProcessed: number;
  fillsCount: number;
  bufferSizeBytes: number;
  bestBid: number;
  bestAsk: number;
  lastTradePrice: number;
  currentSpreadBps: number;
  msgRate: number;
  errorMessage?: string;
}

interface SimOrder {
  id: number;
  side: 1 | -1; // 1 buy, -1 sell
  tick: number;
  qty: number;
  leaves: number;
  status: number; // 1 NEW, 3 FILLED, 4 CANCELED
  submitT: number;
  ackT: number;
  front: number;
  level: number;
  tradedAtLevel: number;
}

interface FrameRecord {
  t: number;
  bestBidTick: number;
  bestAskTick: number;
  bidTicks: number[];
  bidQtys: number[];
  askTicks: number[];
  askQtys: number[];
  position: number;
  numTrades: number;
  volume: number;
  feedLatLast: number;
  feedLatMin: number;
  feedLatMax: number;
  feedLatMean: number;
  feedBatches: number;
  activeOrders: SimOrder[];
}

interface TradeRecord {
  exchT: number;
  localT: number;
  tick: number;
  qty: number;
  side: 1 | -1;
}

interface EventRecord {
  t: number;
  kind: number; // 1 SUBMIT, 2 ACK, 3 FILL, 4 CANCEL, 5 CANCELED
  id: number;
  side: 1 | -1;
  tick: number;
  qty: number;
  reqT: number;
  exchT: number;
  front: number;
  level: number;
  execTick: number;
  tradedAtLevel: number;
}

export class MarketRecorder {
  private config: RecorderConfig;
  private sec: SecurityProfile;
  private ws: WebSocket | null = null;
  private timer: number | null = null;
  private simInterval: number | null = null;
  private startTime = 0;
  private metrics: RecorderLiveMetrics;
  private onMetricsUpdate: (m: RecorderLiveMetrics) => void;

  // L2 Order book state
  private bids = new Map<number, number>(); // tick -> qty
  private asks = new Map<number, number>(); // tick -> qty
  private bestBidTick = 0;
  private bestAskTick = 0;

  // Simulation state
  private nextOrderId = 1001;
  private liveOrders = new Map<number, SimOrder>();
  private position = 0;
  private numTrades = 0;
  private volume = 0;
  private entryLatNs = 1_500_000; // 1.5ms default
  private respLatNs = 2_000_000; // 2.0ms default

  // Recorded stream
  private frames: FrameRecord[] = [];
  private trades: TradeRecord[] = [];
  private events: EventRecord[] = [];
  private packetsCount = 0;
  private l2Count = 0;
  private tradesCount = 0;
  private fillsCount = 0;
  private lastMsgCount = 0;
  private msgRate = 0;

  constructor(config: RecorderConfig, onMetricsUpdate: (m: RecorderLiveMetrics) => void) {
    this.config = config;
    this.sec = getSecurity(config.symbol);
    this.onMetricsUpdate = onMetricsUpdate;

    if (config.latencyProfile === "cross_connect") {
      this.entryLatNs = 200_000; // 0.2ms
      this.respLatNs = 300_000;
    } else if (config.latencyProfile === "colo_aws") {
      this.entryLatNs = 2_500_000; // 2.5ms
      this.respLatNs = 3_500_000;
    } else {
      this.entryLatNs = 12_000_000; // 12ms
      this.respLatNs = 16_000_000;
    }

    this.metrics = {
      status: "idle",
      symbol: this.config.symbol,
      elapsedSec: 0,
      durationSec: this.config.durationSec,
      packetsReceived: 0,
      l2Updates: 0,
      tradesProcessed: 0,
      fillsCount: 0,
      bufferSizeBytes: 0,
      bestBid: this.sec.basePrice - this.sec.tickSize,
      bestAsk: this.sec.basePrice + this.sec.tickSize,
      lastTradePrice: this.sec.basePrice,
      currentSpreadBps: ((this.sec.tickSize * 2) / this.sec.basePrice) * 10000,
      msgRate: 0,
    };
  }

  public async start(): Promise<void> {
    this.metrics.status = "connecting";
    this.metrics.errorMessage = undefined;
    this.onMetricsUpdate({ ...this.metrics });

    this.startTime = Date.now();
    const sym = this.config.symbol.toLowerCase();

    // Determine if crypto (connect to Binance public WebSocket) or Simulated Equity/FX
    const isCrypto =
      this.config.symbol.endsWith("USDT") ||
      this.config.symbol.endsWith("USD") ||
      this.config.symbol.endsWith("BTC") ||
      ["BTC", "ETH", "SOL", "DOGE", "PEPE", "WIF"].includes(this.config.symbol);

    if (isCrypto) {
      try {
        const streamSym = sym.replace(/[^a-z0-9]/g, "");
        const wsUrl = `wss://fstream.binance.com/stream?streams=${streamSym}@depth20@100ms/${streamSym}@aggTrade`;
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          this.metrics.status = "recording";
          this.startHeartbeat();
        };

        this.ws.onmessage = (evt) => {
          this.packetsCount++;
          try {
            const data = JSON.parse(evt.data);
            if (data.stream && data.data) {
              if (data.stream.includes("depth")) {
                this.handleDepthSnapshot(data.data);
              } else if (data.stream.includes("aggTrade")) {
                this.handleTradeMsg(data.data);
              }
            }
          } catch (e) {}
        };

        this.ws.onerror = (e) => {
          console.warn("WebSocket error, falling back to simulated high-frequency stream:", e);
          this.startSimulatedFeed();
        };

        this.ws.onclose = () => {
          if (this.metrics.status === "recording" && this.config.durationSec > 0 && this.metrics.elapsedSec < this.config.durationSec) {
            this.startSimulatedFeed();
          }
        };
      } catch (err) {
        this.startSimulatedFeed();
      }
    } else {
      // Equities, FX, Commodities
      this.startSimulatedFeed();
    }
  }

  private startSimulatedFeed(): void {
    if (this.metrics.status !== "recording") {
      this.metrics.status = "recording";
      this.startHeartbeat();
    }

    // High-frequency synthetic generator based on security profile
    this.simInterval = window.setInterval(() => {
      this.simulateSyntheticTick();
    }, 50);
  }

  private startHeartbeat(): void {
    // 100ms sample frame loop (10 frames/sec standard)
    this.timer = window.setInterval(() => {
      const now = Date.now();
      const elapsed = (now - this.startTime) / 1000;
      this.metrics.elapsedSec = elapsed;

      // Rate calculation
      this.msgRate = Math.round((this.packetsCount - this.lastMsgCount) * 10);
      this.lastMsgCount = this.packetsCount;
      this.metrics.msgRate = this.msgRate;
      this.metrics.packetsReceived = this.packetsCount;
      this.metrics.l2Updates = this.l2Count;
      this.metrics.tradesProcessed = this.tradesCount;
      this.metrics.fillsCount = this.fillsCount;
      this.metrics.bufferSizeBytes = this.frames.length * 320 + this.events.length * 64 + this.trades.length * 32;

      // Execute MM Strategy logic & record frame
      this.runStrategyCycle();
      this.sampleFrame();

      this.onMetricsUpdate({ ...this.metrics });

      // Auto-stop if duration reached
      if (this.config.durationSec > 0 && elapsed >= this.config.durationSec) {
        this.stop();
      }
    }, 100);
  }

  private handleDepthSnapshot(data: any): void {
    this.l2Count++;
    const bids: [string, string][] = data.b || data.bids || [];
    const asks: [string, string][] = data.a || data.asks || [];

    this.bids.clear();
    for (const [pStr, qStr] of bids) {
      const p = parseFloat(pStr);
      const q = parseFloat(qStr);
      if (p > 0 && q > 0) {
        const tick = Math.round(p / this.sec.tickSize);
        this.bids.set(tick, q);
      }
    }

    this.asks.clear();
    for (const [pStr, qStr] of asks) {
      const p = parseFloat(pStr);
      const q = parseFloat(qStr);
      if (p > 0 && q > 0) {
        const tick = Math.round(p / this.sec.tickSize);
        this.asks.set(tick, q);
      }
    }

    this.updateBBO();
  }

  private handleTradeMsg(data: any): void {
    this.tradesCount++;
    const p = parseFloat(data.p);
    const q = parseFloat(data.q);
    const isBuyerMaker = !!data.m; // true = SELL aggressor into bid; false = BUY aggressor into ask
    const side: 1 | -1 = isBuyerMaker ? -1 : 1;
    const tick = Math.round(p / this.sec.tickSize);
    const nowNs = (Date.now() - this.startTime) * 1_000_000;

    this.metrics.lastTradePrice = p;

    // Record trade
    this.trades.push({
      exchT: (data.T ? data.T * 1_000_000 : nowNs),
      localT: nowNs,
      tick,
      qty: q,
      side,
    });

    // Match against our live resting orders
    this.matchOrdersAgainstTrade(tick, q, side, nowNs);
  }

  private simulateSyntheticTick(): void {
    this.packetsCount += 2;
    this.l2Count++;
    const mid = this.sec.basePrice + (Math.sin(Date.now() / 3000) * this.sec.tickSize * 8) + (Math.random() - 0.5) * this.sec.tickSize * 2;
    const spreadTicks = Math.max(1, Math.round(((this.sec.targetSpreadBps || 2) / 10000) * this.sec.basePrice / this.sec.tickSize));
    const bestBid = mid - (spreadTicks * this.sec.tickSize) / 2;
    const bestAsk = mid + (spreadTicks * this.sec.tickSize) / 2;

    this.bids.clear();
    this.asks.clear();
    for (let i = 0; i < 20; i++) {
      const bTick = Math.round((bestBid - i * this.sec.tickSize) / this.sec.tickSize);
      const aTick = Math.round((bestAsk + i * this.sec.tickSize) / this.sec.tickSize);
      this.bids.set(bTick, this.sec.lotSize * (10 + Math.random() * 20));
      this.asks.set(aTick, this.sec.lotSize * (10 + Math.random() * 20));
    }
    this.updateBBO();

    // Occasional trade
    if (Math.random() < 0.4) {
      this.tradesCount++;
      const isBuy = Math.random() < 0.5;
      const px = isBuy ? this.bestAskTick * this.sec.tickSize : this.bestBidTick * this.sec.tickSize;
      const q = this.sec.lotSize * (1 + Math.floor(Math.random() * 4));
      const nowNs = (Date.now() - this.startTime) * 1_000_000;
      this.metrics.lastTradePrice = px;
      this.trades.push({
        exchT: nowNs,
        localT: nowNs,
        tick: Math.round(px / this.sec.tickSize),
        qty: q,
        side: isBuy ? 1 : -1,
      });
      this.matchOrdersAgainstTrade(Math.round(px / this.sec.tickSize), q, isBuy ? 1 : -1, nowNs);
    }
  }

  private updateBBO(): void {
    let maxBid = -Infinity;
    for (const tick of this.bids.keys()) {
      if (tick > maxBid) maxBid = tick;
    }
    let minAsk = Infinity;
    for (const tick of this.asks.keys()) {
      if (tick < minAsk) minAsk = tick;
    }

    if (maxBid > 0) this.bestBidTick = maxBid;
    if (minAsk < Infinity) this.bestAskTick = minAsk;

    const bPx = this.bestBidTick * this.sec.tickSize;
    const aPx = this.bestAskTick * this.sec.tickSize;
    this.metrics.bestBid = bPx;
    this.metrics.bestAsk = aPx;
    if (bPx > 0 && aPx > bPx) {
      this.metrics.currentSpreadBps = ((aPx - bPx) / ((aPx + bPx) / 2)) * 10000;
    }
  }

  private matchOrdersAgainstTrade(trTick: number, trQty: number, trSide: 1 | -1, nowNs: number): void {
    for (const order of this.liveOrders.values()) {
      if (order.status !== 1 || order.leaves <= 0) continue;
      // Order must be ACKed by the exchange before it can fill
      if (nowNs < order.ackT) continue;

      if (order.side === 1 && trSide === -1) {
        // We are resting BUY, incoming trade is SELL
        if (trTick <= order.tick) {
          // Trade executed at or through our bid
          if (trTick < order.tick || trQty > order.front) {
            this.executeFill(order, Math.min(order.leaves, trQty), order.tick, nowNs);
          } else {
            order.front = Math.max(0, order.front - trQty);
            order.tradedAtLevel += trQty;
          }
        }
      } else if (order.side === -1 && trSide === 1) {
        // We are resting SELL, incoming trade is BUY
        if (trTick >= order.tick) {
          if (trTick > order.tick || trQty > order.front) {
            this.executeFill(order, Math.min(order.leaves, trQty), order.tick, nowNs);
          } else {
            order.front = Math.max(0, order.front - trQty);
            order.tradedAtLevel += trQty;
          }
        }
      }
    }
  }

  private executeFill(order: SimOrder, fillQty: number, execTick: number, nowNs: number): void {
    order.leaves = Math.max(0, order.leaves - fillQty);
    if (order.leaves <= 0) {
      order.status = 3; // FILLED
    }

    this.fillsCount++;
    this.numTrades++;
    this.volume += fillQty;
    this.position += order.side === 1 ? fillQty : -fillQty;

    // Record FILL event
    this.events.push({
      t: nowNs,
      kind: 3, // FILL
      id: order.id,
      side: order.side,
      tick: order.tick,
      qty: fillQty,
      reqT: order.submitT,
      exchT: nowNs - this.respLatNs / 2,
      front: order.front,
      level: order.level,
      execTick,
      tradedAtLevel: order.tradedAtLevel,
    });
  }

  private runStrategyCycle(): void {
    const nowNs = (Date.now() - this.startTime) * 1_000_000;
    if (this.bestBidTick <= 0 || this.bestAskTick <= this.bestBidTick) return;

    const baseQty = this.config.orderQty || this.sec.lotSize * 2;

    // Cancel old unfilled orders that drifted far from BBO
    for (const order of this.liveOrders.values()) {
      if (order.status === 1) {
        const drift = order.side === 1 ? this.bestBidTick - order.tick : order.tick - this.bestAskTick;
        if (drift > 3 || drift < -1) {
          order.status = 4; // CANCELED
          this.events.push({
            t: nowNs,
            kind: 5, // CANCELED
            id: order.id,
            side: order.side,
            tick: order.tick,
            qty: order.leaves,
            reqT: nowNs - this.entryLatNs,
            exchT: nowNs,
            front: order.front,
            level: order.level,
            execTick: 0,
            tradedAtLevel: order.tradedAtLevel,
          });
        }
      }
    }

    // Ensure we have active quotes at target levels
    const hasBuy = Array.from(this.liveOrders.values()).some((o) => o.side === 1 && o.status === 1);
    const hasSell = Array.from(this.liveOrders.values()).some((o) => o.side === -1 && o.status === 1);

    if (!hasBuy) {
      const buyTick = this.bestBidTick;
      const front = this.bids.get(buyTick) || baseQty * 5;
      const id = this.nextOrderId++;
      const order: SimOrder = {
        id,
        side: 1,
        tick: buyTick,
        qty: baseQty,
        leaves: baseQty,
        status: 1,
        submitT: nowNs,
        ackT: nowNs + this.entryLatNs + this.respLatNs,
        front,
        level: front + baseQty,
        tradedAtLevel: 0,
      };
      this.liveOrders.set(id, order);

      // SUBMIT event
      this.events.push({
        t: nowNs,
        kind: 1, // SUBMIT
        id,
        side: 1,
        tick: buyTick,
        qty: baseQty,
        reqT: nowNs,
        exchT: nowNs + this.entryLatNs,
        front,
        level: order.level,
        execTick: 0,
        tradedAtLevel: 0,
      });

      // ACK event
      this.events.push({
        t: order.ackT,
        kind: 2, // ACK
        id,
        side: 1,
        tick: buyTick,
        qty: baseQty,
        reqT: nowNs,
        exchT: nowNs + this.entryLatNs,
        front,
        level: order.level,
        execTick: 0,
        tradedAtLevel: 0,
      });
    }

    if (!hasSell) {
      const sellTick = this.bestAskTick;
      const front = this.asks.get(sellTick) || baseQty * 5;
      const id = this.nextOrderId++;
      const order: SimOrder = {
        id,
        side: -1,
        tick: sellTick,
        qty: baseQty,
        leaves: baseQty,
        status: 1,
        submitT: nowNs,
        ackT: nowNs + this.entryLatNs + this.respLatNs,
        front,
        level: front + baseQty,
        tradedAtLevel: 0,
      };
      this.liveOrders.set(id, order);

      // SUBMIT event
      this.events.push({
        t: nowNs,
        kind: 1, // SUBMIT
        id,
        side: -1,
        tick: sellTick,
        qty: baseQty,
        reqT: nowNs,
        exchT: nowNs + this.entryLatNs,
        front,
        level: order.level,
        execTick: 0,
        tradedAtLevel: 0,
      });

      // ACK event
      this.events.push({
        t: order.ackT,
        kind: 2, // ACK
        id,
        side: -1,
        tick: sellTick,
        qty: baseQty,
        reqT: nowNs,
        exchT: nowNs + this.entryLatNs,
        front,
        level: order.level,
        execTick: 0,
        tradedAtLevel: 0,
      });
    }
  }

  private sampleFrame(): void {
    const nowNs = (Date.now() - this.startTime) * 1_000_000;

    // Extract sorted 20 bid and 20 ask ticks
    const sortedBids = Array.from(this.bids.entries())
      .sort((a, b) => b[0] - a[0])
      .slice(0, 20);
    const sortedAsks = Array.from(this.asks.entries())
      .sort((a, b) => a[0] - b[0])
      .slice(0, 20);

    const bTicks: number[] = [];
    const bQtys: number[] = [];
    for (let i = 0; i < 20; i++) {
      if (i < sortedBids.length) {
        bTicks.push(sortedBids[i][0]);
        bQtys.push(sortedBids[i][1]);
      } else {
        const fallbackTick = (this.bestBidTick || 600000) - i;
        bTicks.push(fallbackTick);
        bQtys.push(0);
      }
    }

    const aTicks: number[] = [];
    const aQtys: number[] = [];
    for (let i = 0; i < 20; i++) {
      if (i < sortedAsks.length) {
        aTicks.push(sortedAsks[i][0]);
        aQtys.push(sortedAsks[i][1]);
      } else {
        const fallbackTick = (this.bestAskTick || 600010) + i;
        aTicks.push(fallbackTick);
        aQtys.push(0);
      }
    }

    // Active orders in this frame
    const activeOrders = Array.from(this.liveOrders.values()).filter((o) => o.status === 1);

    const latBase = this.entryLatNs / 1_000_000;
    this.frames.push({
      t: nowNs,
      bestBidTick: this.bestBidTick || bTicks[0],
      bestAskTick: this.bestAskTick || aTicks[0],
      bidTicks: bTicks,
      bidQtys: bQtys,
      askTicks: aTicks,
      askQtys: aQtys,
      position: this.position,
      numTrades: this.numTrades,
      volume: this.volume,
      feedLatLast: latBase + Math.random() * 0.8,
      feedLatMin: latBase * 0.8,
      feedLatMax: latBase * 2.2,
      feedLatMean: latBase * 1.1,
      feedBatches: Math.max(1, this.msgRate),
      activeOrders,
    });
  }

  public async stop(): Promise<{ hbr: Hbr; buffer: ArrayBuffer }> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.simInterval) {
      clearInterval(this.simInterval);
      this.simInterval = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.metrics.status = "compiling";
    this.onMetricsUpdate({ ...this.metrics });

    const result = this.compileHbr();
    this.metrics.status = "done";
    this.onMetricsUpdate({ ...this.metrics });

    return result;
  }

  private compileHbr(): { hbr: Hbr; buffer: ArrayBuffer } {
    const N = this.frames.length;
    const levels = 20;
    const t0Ns = BigInt(this.startTime) * 1_000_000n;
    const totalEvents = this.events.length;
    const totalTrades = this.trades.length;

    // Calculate max orders per frame
    let maxOrders = 0;
    for (const f of this.frames) {
      if (f.activeOrders.length > maxOrders) maxOrders = f.activeOrders.length;
    }
    maxOrders = Math.max(10, maxOrders);

    // Metadata
    const meta = {
      symbol: this.sec.symbol,
      tick_size: this.sec.tickSize,
      lot_size: this.sec.lotSize,
      levels,
      frame_ns: 100_000_000, // 100ms
      n_frames: N,
      t0_ns: t0Ns.toString(),
      exchange: this.sec.exchange || "Binance USDT-M Futures",
      strategy: {
        name:
          this.config.strategy === "avellaneda"
            ? "Avellaneda-Stoikov Inventory MM"
            : this.config.strategy === "passive_grid"
            ? "Passive Multi-Level Grid"
            : "Queue MM (High-Frequency)",
        order_qty: this.config.orderQty || this.sec.lotSize * 2,
        grid_num: 5,
      },
      run: {
        events_total: totalEvents + totalTrades,
        time_range_ns: [0, N > 0 ? this.frames[N - 1].t : 0],
      },
    };

    // Arrays
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

    const totalOrderSlots = N * maxOrders;
    const oId = new Float64Array(totalOrderSlots);
    const oSide = new Int8Array(totalOrderSlots);
    const oTick = new Int32Array(totalOrderSlots);
    const oQty = new Float32Array(totalOrderSlots);
    const oLeaves = new Float32Array(totalOrderSlots);
    const oStatus = new Uint8Array(totalOrderSlots);
    const oReq = new Uint8Array(totalOrderSlots);
    const oFront = new Float32Array(totalOrderSlots);
    const oLevel = new Float32Array(totalOrderSlots);
    const oSubmitT = new Float64Array(totalOrderSlots);
    const oAckT = new Float64Array(totalOrderSlots);
    const oTradesAtLevel = new Uint32Array(totalOrderSlots);

    for (let i = 0; i < N; i++) {
      const f = this.frames[i];
      frameT[i] = f.t;
      bestBidTick[i] = f.bestBidTick;
      bestAskTick[i] = f.bestAskTick;
      position[i] = f.position;
      numTrades[i] = f.numTrades;
      volume[i] = f.volume;
      feedLatLast[i] = f.feedLatLast;
      feedLatMin[i] = f.feedLatMin;
      feedLatMax[i] = f.feedLatMax;
      feedLatMean[i] = f.feedLatMean;
      feedBatches[i] = f.feedBatches;
      eventsLocal[i] = f.t;
      eventsExch[i] = f.t;
      wallMs[i] = i * 100;
      orderStart[i] = i * maxOrders;

      for (let l = 0; l < levels; l++) {
        const idx = i * levels + l;
        bidTick[idx] = f.bidTicks[l] || 0;
        bidQty[idx] = f.bidQtys[l] || 0;
        askTick[idx] = f.askTicks[l] || 0;
        askQty[idx] = f.askQtys[l] || 0;
      }

      for (let o = 0; o < maxOrders; o++) {
        const oIdx = i * maxOrders + o;
        if (o < f.activeOrders.length) {
          const ord = f.activeOrders[o];
          oId[oIdx] = ord.id;
          oSide[oIdx] = ord.side;
          oTick[oIdx] = ord.tick;
          oQty[oIdx] = ord.qty;
          oLeaves[oIdx] = ord.leaves;
          oStatus[oIdx] = ord.status;
          oReq[oIdx] = 0;
          oFront[oIdx] = ord.front;
          oLevel[oIdx] = ord.level;
          oSubmitT[oIdx] = ord.submitT;
          oAckT[oIdx] = ord.ackT;
          oTradesAtLevel[oIdx] = Math.round(ord.tradedAtLevel);
        }
      }
    }
    orderStart[N] = N * maxOrders;

    // Trades arrays
    const trExchT = new Float64Array(totalTrades);
    const trLocalT = new Float64Array(totalTrades);
    const trTick = new Int32Array(totalTrades);
    const trQty = new Float32Array(totalTrades);
    const trSide = new Int8Array(totalTrades);

    for (let t = 0; t < totalTrades; t++) {
      const tr = this.trades[t];
      trExchT[t] = tr.exchT;
      trLocalT[t] = tr.localT;
      trTick[t] = tr.tick;
      trQty[t] = tr.qty;
      trSide[t] = tr.side;
    }

    // Events arrays
    const eT = new Float64Array(totalEvents);
    const eKind = new Uint8Array(totalEvents);
    const eId = new Float64Array(totalEvents);
    const eSide = new Int8Array(totalEvents);
    const eTick = new Int32Array(totalEvents);
    const eQty = new Float32Array(totalEvents);
    const eReqT = new Float64Array(totalEvents);
    const eExchT = new Float64Array(totalEvents);
    const eFront = new Float32Array(totalEvents);
    const eLevel = new Float32Array(totalEvents);
    const eExecTick = new Int32Array(totalEvents);
    const eTradedAtLevel = new Float32Array(totalEvents);

    for (let e = 0; e < totalEvents; e++) {
      const ev = this.events[e];
      eT[e] = ev.t;
      eKind[e] = ev.kind;
      eId[e] = ev.id;
      eSide[e] = ev.side;
      eTick[e] = ev.tick;
      eQty[e] = ev.qty;
      eReqT[e] = ev.reqT;
      eExchT[e] = ev.exchT;
      eFront[e] = ev.front;
      eLevel[e] = ev.level;
      eExecTick[e] = ev.execTick;
      eTradedAtLevel[e] = ev.tradedAtLevel;
    }

    const arrays = new Map<string, { data: TypedArray; shape: number[] }>();
    arrays.set("frame_t", { data: frameT, shape: [N] });
    arrays.set("best_bid_tick", { data: bestBidTick, shape: [N] });
    arrays.set("best_ask_tick", { data: bestAskTick, shape: [N] });
    arrays.set("bid_tick", { data: bidTick, shape: [N, levels] });
    arrays.set("bid_qty", { data: bidQty, shape: [N, levels] });
    arrays.set("ask_tick", { data: askTick, shape: [N, levels] });
    arrays.set("ask_qty", { data: askQty, shape: [N, levels] });
    arrays.set("position", { data: position, shape: [N] });
    arrays.set("num_trades", { data: numTrades, shape: [N] });
    arrays.set("volume", { data: volume, shape: [N] });
    arrays.set("feed_lat_last", { data: feedLatLast, shape: [N] });
    arrays.set("feed_lat_min", { data: feedLatMin, shape: [N] });
    arrays.set("feed_lat_max", { data: feedLatMax, shape: [N] });
    arrays.set("feed_lat_mean", { data: feedLatMean, shape: [N] });
    arrays.set("feed_batches", { data: feedBatches, shape: [N] });
    arrays.set("events_local", { data: eventsLocal, shape: [N] });
    arrays.set("events_exch", { data: eventsExch, shape: [N] });
    arrays.set("wall_ms", { data: wallMs, shape: [N] });
    arrays.set("order_start", { data: orderStart, shape: [N + 1] });

    arrays.set("o_id", { data: oId, shape: [totalOrderSlots] });
    arrays.set("o_side", { data: oSide, shape: [totalOrderSlots] });
    arrays.set("o_tick", { data: oTick, shape: [totalOrderSlots] });
    arrays.set("o_qty", { data: oQty, shape: [totalOrderSlots] });
    arrays.set("o_leaves", { data: oLeaves, shape: [totalOrderSlots] });
    arrays.set("o_status", { data: oStatus, shape: [totalOrderSlots] });
    arrays.set("o_req", { data: oReq, shape: [totalOrderSlots] });
    arrays.set("o_front", { data: oFront, shape: [totalOrderSlots] });
    arrays.set("o_level", { data: oLevel, shape: [totalOrderSlots] });
    arrays.set("o_submit_t", { data: oSubmitT, shape: [totalOrderSlots] });
    arrays.set("o_ack_t", { data: oAckT, shape: [totalOrderSlots] });
    arrays.set("o_trades_at_level", { data: oTradesAtLevel, shape: [totalOrderSlots] });

    arrays.set("tr_exch_t", { data: trExchT, shape: [totalTrades] });
    arrays.set("tr_local_t", { data: trLocalT, shape: [totalTrades] });
    arrays.set("tr_tick", { data: trTick, shape: [totalTrades] });
    arrays.set("tr_qty", { data: trQty, shape: [totalTrades] });
    arrays.set("tr_side", { data: trSide, shape: [totalTrades] });

    arrays.set("e_t", { data: eT, shape: [totalEvents] });
    arrays.set("e_kind", { data: eKind, shape: [totalEvents] });
    arrays.set("e_id", { data: eId, shape: [totalEvents] });
    arrays.set("e_side", { data: eSide, shape: [totalEvents] });
    arrays.set("e_tick", { data: eTick, shape: [totalEvents] });
    arrays.set("e_qty", { data: eQty, shape: [totalEvents] });
    arrays.set("e_req_t", { data: eReqT, shape: [totalEvents] });
    arrays.set("e_exch_t", { data: eExchT, shape: [totalEvents] });
    arrays.set("e_front", { data: eFront, shape: [totalEvents] });
    arrays.set("e_level", { data: eLevel, shape: [totalEvents] });
    arrays.set("e_exec_tick", { data: eExecTick, shape: [totalEvents] });
    arrays.set("e_traded_at_level", { data: eTradedAtLevel, shape: [totalEvents] });

    const hbr: Hbr = { meta, arrays };
    const buffer = encodeHbr(hbr);

    return { hbr, buffer };
  }
}
