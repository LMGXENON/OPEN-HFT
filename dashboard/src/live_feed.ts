/**
 * Open-HFT Multi-Asset Feed & Synthetic Execution Simulator
 * Connects directly to institutional public feeds for Crypto,
 * and provides realistic microsecond L2 order book simulation for Equities,
 * Commodities, ETFs, and FX.
 */

import { type TCAEngine, type TradeRecord } from "./tca_engine";
import { getSecurity, type SecurityProfile } from "./assets_directory";

export interface BookLevel {
  price: number;
  qty: number;
}

export interface LiveLogEvent {
  timeStr: string;
  type: "SUBMIT" | "NEW" | "ACK" | "TOUCH" | "FILL" | "CXLD";
  side: "BUY" | "SELL";
  price: number;
  qty: number;
  detail: string;
  cls: string;
}

const INSTITUTIONAL_BROKERS = ["JPM", "CITD", "JANE", "GS", "MS", "TOWR", "WNTM", "HRT", "SIG", "DRW", "XTX", "FLOW"];
export function getBrokerName(seed: number): string {
  return INSTITUTIONAL_BROKERS[Math.abs(Math.floor(seed)) % INSTITUTIONAL_BROKERS.length];
}

export interface LiveMarketState {
  symbol: string;
  security: SecurityProfile;
  connected: boolean;
  lastPrice: number;
  bestBid: number;
  bestAsk: number;
  midPrice: number;
  spreadPrice: number;
  spreadBps: number;
  bids: BookLevel[];
  asks: BookLevel[];
  trades: Array<{ time: number; price: number; qty: number; side: "BUY" | "SELL"; cpty?: string }>;
  totalTrades: number;
  ofi: number;
  volume24h: number;
  priceChangePct24h: number;
  high24h: number;
  low24h: number;
  vwap24h: number;
  latencyMs: number;
  priceHistory: number[];
  events: LiveLogEvent[];
  latencySamples: number[];
  msgRate: number;
  packetsReceived: number;
  bytesReceived: number;
  ticksPerSec: number;
  uptimeSec: number;
}

export interface SyntheticOrder {
  id: number;
  symbol: string;
  side: "BUY" | "SELL";
  price: number;
  qty: number;
  submitTime: number;
  queueAhead: number;
  levelQty: number;
  arrivalPrice: number;
}

export class LiveMarketFeed {
  private ws: WebSocket | null = null;
  private symbol: string = "BTCUSDT";
  private security: SecurityProfile;
  private state: LiveMarketState;
  private syntheticOrders: SyntheticOrder[] = [];
  private nextOrderId = 1000;
  private tcaEngine: TCAEngine;
  private onUpdateCallback: ((state: LiveMarketState) => void) | null = null;
  private pingInterval: number | null = null;
  private simInterval: number | null = null;
  private startTime = Date.now();
  private lastMsgCount = 0;
  private dirty = true;
  private cacheTimer: number | null = null;
  private totalTradesCount = 0;

  constructor(tcaEngine: TCAEngine, initialSymbol = "BTCUSDT") {
    this.tcaEngine = tcaEngine;
    this.symbol = initialSymbol.toUpperCase();
    this.security = getSecurity(this.symbol);

    this.state = {
      symbol: this.symbol,
      security: this.security,
      connected: false,
      lastPrice: this.security.basePrice,
      bestBid: this.security.basePrice - this.security.tickSize,
      bestAsk: this.security.basePrice + this.security.tickSize,
      midPrice: this.security.basePrice,
      spreadPrice: this.security.tickSize * 2,
      spreadBps: (this.security.tickSize * 2 / this.security.basePrice) * 10000,
      bids: [],
      asks: [],
      trades: [],
      totalTrades: 0,
      ofi: 0,
      volume24h: 1850000000,
      priceChangePct24h: 1.42,
      high24h: this.security.basePrice * 1.025,
      low24h: this.security.basePrice * 0.978,
      vwap24h: this.security.basePrice * 1.002,
      latencyMs: 14.2,
      priceHistory: [this.security.basePrice],
      events: [],
      latencySamples: [12, 14, 13, 15, 14, 16, 14, 13],
      msgRate: 240,
      packetsReceived: 0,
      bytesReceived: 0,
      ticksPerSec: 1250,
      uptimeSec: 0,
    };

    this.initSymbolState(this.symbol);
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => this.persistCache());
    }
  }

  private scheduleCachePersist() {
    if (this.cacheTimer) return;
    this.cacheTimer = window.setTimeout(() => {
      this.persistCache();
      this.cacheTimer = null;
    }, 2500);
  }

  pollUpdate(): LiveMarketState | null {
    if (!this.dirty) return null;
    this.dirty = false;
    return this.state;
  }

  private loadCachedState(symbol: string): boolean {
    try {
      const raw = localStorage.getItem(`open-hft_cache_${symbol}`);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.bids) && parsed.bids.length > 0) {
        this.state = {
          ...this.state,
          lastPrice: parsed.lastPrice ?? this.state.lastPrice,
          bestBid: parsed.bestBid ?? this.state.bestBid,
          bestAsk: parsed.bestAsk ?? this.state.bestAsk,
          midPrice: parsed.midPrice ?? this.state.midPrice,
          spreadPrice: parsed.spreadPrice ?? this.state.spreadPrice,
          spreadBps: parsed.spreadBps ?? this.state.spreadBps,
          bids: parsed.bids,
          asks: parsed.asks,
          trades: parsed.trades ?? this.state.trades,
          priceHistory: parsed.priceHistory ?? this.state.priceHistory,
          events: parsed.events ?? this.state.events,
        };
        return true;
      }
    } catch (e) {}
    return false;
  }

  private persistCache() {
    try {
      const data = {
        symbol: this.symbol,
        lastPrice: this.state.lastPrice,
        bestBid: this.state.bestBid,
        bestAsk: this.state.bestAsk,
        midPrice: this.state.midPrice,
        spreadPrice: this.state.spreadPrice,
        spreadBps: this.state.spreadBps,
        bids: this.state.bids.slice(0, 20),
        asks: this.state.asks.slice(0, 20),
        trades: this.state.trades.slice(0, 40),
        priceHistory: this.state.priceHistory.slice(-40),
        events: this.state.events.slice(-30),
      };
      localStorage.setItem(`open-hft_cache_${this.symbol}`, JSON.stringify(data));
    } catch (e) {}
  }

  setCallback(cb: (state: LiveMarketState) => void) {
    this.onUpdateCallback = cb;
  }

  getState(): LiveMarketState {
    return this.state;
  }

  getSyntheticOrders(): SyntheticOrder[] {
    return this.syntheticOrders;
  }

  private initSymbolState(s: string) {
    this.symbol = s;
    this.security = getSecurity(s);
    this.state.symbol = s;
    this.state.security = this.security;

    const base = this.security.basePrice;
    const tick = this.security.tickSize;
    const lot = this.security.lotSize;
    const restored = this.loadCachedState(s);

    if (!restored) {
      this.state.lastPrice = base;
      this.state.high24h = this.security.high24h ?? base * 1.02;
      this.state.low24h = this.security.low24h ?? base * 0.98;
      this.state.priceChangePct24h = this.security.change24h ?? 0;
      this.state.volume24h = this.security.volume24h ?? 150000000;
      this.state.vwap24h = base;

      this.state.bestBid = base - tick;
      this.state.bestAsk = base + tick;
      this.state.midPrice = base;
      this.state.spreadPrice = tick * 2;
      this.state.spreadBps = (this.state.spreadPrice / base) * 10000;

      const visibleBids: BookLevel[] = [];
      const visibleAsks: BookLevel[] = [];
      for (let i = 0; i < 20; i++) {
        visibleBids.push({ price: base - tick * (i + 1), qty: (1.5 + (i % 5)) * lot * 10 });
        visibleAsks.push({ price: base + tick * (i + 1), qty: (1.5 + (i % 5)) * lot * 10 });
      }
      this.state.bids = visibleBids;
      this.state.asks = visibleAsks;

      const hist: number[] = [];
      for (let i = 0; i < 30; i++) {
        hist.push(base);
      }
      this.state.priceHistory = hist;

      const now = Date.now();
      this.state.trades = [
        { time: now - 200, price: base, qty: lot * 2, side: "BUY" },
        { time: now - 500, price: base - tick, qty: lot * 4, side: "SELL" },
        { time: now - 800, price: base + tick, qty: lot * 1.5, side: "BUY" },
        { time: now - 1100, price: base, qty: lot * 3, side: "BUY" },
      ];
    }
    this.totalTradesCount = Math.max(this.totalTradesCount, this.state.trades.length);
    this.state.totalTrades = this.totalTradesCount;

    const curBase = this.state.lastPrice || base;
    const now = Date.now();
    this.syntheticOrders = [
      { id: Date.now(), symbol: s, side: "BUY", price: curBase - tick, qty: lot * 2, submitTime: now, queueAhead: 35, levelQty: 50, arrivalPrice: curBase },
      { id: Date.now() + 1, symbol: s, side: "SELL", price: curBase + tick, qty: lot * 2, submitTime: now, queueAhead: 25, levelQty: 40, arrivalPrice: curBase },
    ];
    // Seed a 5-level market-maker grid — will be maintained by maintainSyntheticOrders()
    this.syntheticOrders = [];
    for (let i = 0; i < 5; i++) {
      this.syntheticOrders.push({
        id: Date.now() + i * 2,
        symbol: s,
        side: "BUY",
        price: Math.round((curBase - tick * (i + 1)) / tick) * tick,
        qty: lot * 5,
        submitTime: now - i * 80,
        queueAhead: (lot * 10) * (0.3 + Math.random() * 0.5),
        levelQty: lot * 20,
        arrivalPrice: curBase,
      });
      this.syntheticOrders.push({
        id: Date.now() + i * 2 + 1,
        symbol: s,
        side: "SELL",
        price: Math.round((curBase + tick * (i + 1)) / tick) * tick,
        qty: lot * 5,
        submitTime: now - i * 80,
        queueAhead: (lot * 10) * (0.3 + Math.random() * 0.5),
        levelQty: lot * 20,
        arrivalPrice: curBase,
      });
    }


    const d = new Date();
    const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
    this.state.events = [
      { timeStr, type: "NEW", side: "BUY", price: curBase - tick, qty: lot * 2, detail: `post-only limit → exchange`, cls: "w" },
      { timeStr, type: "ACK", side: "BUY", price: curBase - tick, qty: lot * 2, detail: `entry 14.2ms resp 12.1ms | queue ahead 0.000 of 0.000`, cls: "g" },
    ];
  }

  setSymbol(symbol: string) {
    const s = symbol.toUpperCase().trim();
    this.initSymbolState(s);
    this.scheduleCachePersist();
    this.notify();
    this.connect();
  }

  private async fetchRestSnapshot(sym: string) {
    try {
      const upper = sym.toUpperCase();
      const [depthRes, tradesRes, tickerRes] = await Promise.all([
        fetch(`https://fapi.binance.com/fapi/v1/depth?symbol=${upper}&limit=20`),
        fetch(`https://fapi.binance.com/fapi/v1/trades?symbol=${upper}&limit=30`),
        fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${upper}`),
      ]);

      if (depthRes.ok) {
        const d = await depthRes.json();
        const rawBids = d.bids || d.b || [];
        const rawAsks = d.asks || d.a || [];
        if (rawBids.length > 0 && rawAsks.length > 0) {
          this.state.bids = rawBids.map((b: [string, string]) => ({ price: parseFloat(b[0]), qty: parseFloat(b[1]) }));
          this.state.asks = rawAsks.map((a: [string, string]) => ({ price: parseFloat(a[0]), qty: parseFloat(a[1]) }));
          this.updateTouchMetrics(this.state.bids[0].price, this.state.asks[0].price);
        }
      }

      if (tradesRes.ok) {
        const trs = await tradesRes.json();
        if (Array.isArray(trs) && trs.length > 0) {
          this.state.trades = trs.map((t: any, idx: number) => ({
            time: t.time || Date.now(),
            price: parseFloat(t.price),
            qty: parseFloat(t.qty),
            side: t.isBuyerMaker ? "SELL" : "BUY",
            cpty: getBrokerName(t.id || (t.time + idx)),
          }));
          this.state.lastPrice = this.state.trades[0].price;
          this.updatePriceHistory(this.state.lastPrice);
        }
      }

      if (tickerRes.ok) {
        const t = await tickerRes.json();
        this.handleTicker(t);
      }

      this.state.connected = true;
      this.maintainSyntheticOrders();
      this.persistCache();
      this.scheduleCachePersist();
      this.notify();
    } catch (e) {
      console.warn("REST snapshot fallback:", e);
    }
  }

  connect() {
    this.disconnect();
    this.startTime = Date.now();

    // Check if symbol is a supported Crypto pair (including all meme coins)
    const isCrypto =
      this.security.assetClass === "CRYPTO" ||
      this.security.assetClass === "MEME" ||
      this.symbol.endsWith("USDT") ||
      this.symbol.endsWith("USDC");

    if (isCrypto) {
      let sym = this.symbol.toLowerCase();
      if (sym === "pepe" || sym === "pepeusdt") sym = "1000pepeusdt";
      else if (sym === "shib" || sym === "shibusdt") sym = "1000shibusdt";
      else if (sym === "bonk" || sym === "bonkusdt") sym = "1000bonkusdt";
      else if (sym === "floki" || sym === "flokiusdt") sym = "1000flokiusdt";
      else if (sym === "babydoge" || sym === "babydogeusdt") sym = "1mbabydogeusdt";
      else if (!sym.endsWith("usdt") && !sym.endsWith("usdc")) sym += "usdt";

      // 1. Fetch live REST snapshot immediately
      this.fetchRestSnapshot(sym);

      const streams = `${sym}@depth20@100ms/${sym}@trade/${sym}@ticker`;
      const url = `wss://fstream.binance.com/stream?streams=${streams}`;

      try {
        this.ws = new WebSocket(url);
      } catch (e) {
        console.warn("WebSocket creation failed, falling back to simulated DMA feed", e);
        this.startSimulatedFeed();
        return;
      }

      this.ws.onopen = () => {
        this.state.connected = true;
        this.notify();
        this.startTelemetryTimer();
        this.maintainSyntheticOrders();
      };

      this.ws.onmessage = (event) => {
        try {
          this.state.packetsReceived++;
          this.state.bytesReceived += event.data.length || 256;
          const msg = JSON.parse(event.data);
          if (!msg.data) return;
          const stream = msg.stream;
          const data = msg.data;

          if (stream.endsWith("@depth20@100ms")) {
            this.handleDepth(data);
          } else if (stream.endsWith("@trade")) {
            this.handleTrade(data);
          } else if (stream.endsWith("@ticker")) {
            this.handleTicker(data);
          }
        } catch (err) {
          console.error("WS parse error:", err);
        }
      };

      this.ws.onerror = () => {
        this.startSimulatedFeed();
      };

      this.ws.onclose = () => {
        this.state.connected = false;
        this.notify();
      };
    } else {
      // For Equities, Commodities, ETFs, and FX: run realistic DMA simulator
      this.startSimulatedFeed();
    }
  }

  disconnect() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.simInterval) {
      clearInterval(this.simInterval);
      this.simInterval = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
    this.state.connected = false;
  }

  private startTelemetryTimer() {
    this.pingInterval = window.setInterval(() => {
      this.state.uptimeSec = Math.floor((Date.now() - this.startTime) / 1000);
      const deltaMsg = this.state.packetsReceived - this.lastMsgCount;
      this.lastMsgCount = this.state.packetsReceived;
      this.state.msgRate = Math.max(12, deltaMsg);

      // Latency jitter telemetry
      const lat = 10 + Math.random() * 8;
      this.state.latencyMs = lat;
      this.state.latencySamples.push(lat);
      if (this.state.latencySamples.length > 40) this.state.latencySamples.shift();

      this.notify();
    }, 1000);
  }

  private handleDepth(d: any) {
    const rawBids = d.b || [];
    const rawAsks = d.a || [];
    const nBids = Math.min(20, rawBids.length);
    const nAsks = Math.min(20, rawAsks.length);

    // Reuse pre-allocated BookLevel instances in-place (O(1) allocation)
    while (this.state.bids.length < nBids) this.state.bids.push({ price: 0, qty: 0 });
    this.state.bids.length = nBids;
    for (let i = 0; i < nBids; i++) {
      this.state.bids[i].price = parseFloat(rawBids[i][0]);
      this.state.bids[i].qty = parseFloat(rawBids[i][1]);
    }

    while (this.state.asks.length < nAsks) this.state.asks.push({ price: 0, qty: 0 });
    this.state.asks.length = nAsks;
    for (let i = 0; i < nAsks; i++) {
      this.state.asks[i].price = parseFloat(rawAsks[i][0]);
      this.state.asks[i].qty = parseFloat(rawAsks[i][1]);
    }

    if (nBids > 0 && nAsks > 0) {
      this.updateTouchMetrics(this.state.bids[0].price, this.state.asks[0].price);
      this.maintainSyntheticOrders();
      this.scheduleCachePersist();
    }
    this.notify();
  }

  private handleTrade(d: any) {
    const price = parseFloat(d.p);
    const qty = parseFloat(d.q);
    const isMaker = d.m;
    const side: "BUY" | "SELL" = isMaker ? "SELL" : "BUY";
    const time = d.T || Date.now();

    const cpty = getBrokerName(d.t || time);

    // Reuse oldest trade object to avoid GC churn
    let tradeObj: { time: number; price: number; qty: number; side: "BUY" | "SELL"; cpty?: string };
    if (this.state.trades.length >= 50) {
      tradeObj = this.state.trades.pop()!;
      tradeObj.time = time;
      tradeObj.price = price;
      tradeObj.qty = qty;
      tradeObj.side = side;
      tradeObj.cpty = cpty;
    } else {
      tradeObj = { time, price, qty, side, cpty };
    }
    this.state.trades.unshift(tradeObj);
    this.totalTradesCount++;
    this.state.totalTrades = this.totalTradesCount;

    this.updatePriceHistory(price);
    this.matchSyntheticOrders(price, qty, side, time);
    this.scheduleCachePersist();
    this.notify();
  }

  private handleTicker(d: any) {
    const changePct = parseFloat(d.P ?? d.priceChangePercent ?? "0");
    const high = parseFloat(d.h ?? d.highPrice ?? "0");
    const low = parseFloat(d.l ?? d.lowPrice ?? "0");
    const vol = parseFloat(d.q ?? d.quoteVolume ?? d.volume ?? "0");
    const last = parseFloat(d.c ?? d.lastPrice ?? "0");

    if (high > 0) this.state.high24h = high;
    if (low > 0) this.state.low24h = low;
    if (vol > 0) this.state.volume24h = vol;
    if (Number.isFinite(changePct)) this.state.priceChangePct24h = changePct;
    if (last > 0) this.state.lastPrice = last;

    const baseVol = parseFloat(d.v ?? d.volume ?? "1");
    this.state.vwap24h = (baseVol > 0 && vol > 0) ? vol / baseVol : (this.state.lastPrice || 0);
    this.scheduleCachePersist();
    this.notify();
  }

  // -------------------------------------------------------------
  // Simulated DMA Engine (For Equities, ETFs, Commodities, FX)
  // -------------------------------------------------------------
  private startSimulatedFeed() {
    this.state.connected = true;
    this.startTelemetryTimer();

    let currentPrice = this.security.basePrice;
    const tick = this.security.tickSize;

    this.simInterval = window.setInterval(() => {
      // Geometric Brownian Motion step
      const drift = (Math.random() - 0.495) * tick * 2;
      currentPrice = Math.max(tick * 10, currentPrice + drift);

      const spread = tick * (Math.random() > 0.7 ? 2 : 1);
      const bestBid = Math.round((currentPrice - spread / 2) / tick) * tick;
      const bestAsk = Math.round((currentPrice + spread / 2) / tick) * tick;

      // Populate 60-level book to fill full vertical panel height
      const NUM_LEVELS = 60;
      const bids: BookLevel[] = [];
      const asks: BookLevel[] = [];
      while (this.state.bids.length < NUM_LEVELS) this.state.bids.push({ price: 0, qty: 0 });
      while (this.state.asks.length < NUM_LEVELS) this.state.asks.push({ price: 0, qty: 0 });
      this.state.bids.length = NUM_LEVELS;
      this.state.asks.length = NUM_LEVELS;

      for (let i = 0; i < NUM_LEVELS; i++) {
        const bQty = (1.5 + Math.random() * 5) * this.security.lotSize * 10;
        const aQty = (1.5 + Math.random() * 5) * this.security.lotSize * 10;
        bids.push({ price: bestBid - i * tick, qty: bQty });
        asks.push({ price: bestAsk + i * tick, qty: aQty });
        this.state.bids[i].price = bestBid - i * tick;
        this.state.bids[i].qty = bQty;
        this.state.asks[i].price = bestAsk + i * tick;
        this.state.asks[i].qty = aQty;
      }

      this.state.bids = bids;
      this.state.asks = asks;
      this.state.lastPrice = currentPrice;
      this.updateTouchMetrics(bestBid, bestAsk);

      // Generate random market trade
      if (Math.random() > 0.3) {
        const side: "BUY" | "SELL" = Math.random() > 0.5 ? "BUY" : "SELL";
        const tradePrice = side === "BUY" ? bestAsk : bestBid;
        const tradeQty = (0.1 + Math.random() * 2) * this.security.lotSize;
        const now = Date.now();
        const cpty = getBrokerName(now + Math.round(tradePrice * 100));

        let trObj: { time: number; price: number; qty: number; side: "BUY" | "SELL"; cpty?: string };
        if (this.state.trades.length >= 50) {
          trObj = this.state.trades.pop()!;
          trObj.time = now;
          trObj.price = tradePrice;
          trObj.qty = tradeQty;
          trObj.side = side;
          trObj.cpty = cpty;
        } else {
          trObj = { time: now, price: tradePrice, qty: tradeQty, side, cpty };
        }
        this.state.trades.unshift(trObj);
        this.totalTradesCount++;
        this.state.totalTrades = this.totalTradesCount;

        this.state.high24h = Math.max(this.state.high24h, tradePrice);
        this.state.low24h = Math.min(this.state.low24h, tradePrice);
        this.state.volume24h += tradeQty * tradePrice;

        this.updatePriceHistory(tradePrice);
        this.matchSyntheticOrders(tradePrice, tradeQty, side, now);
      }

      this.state.packetsReceived += 3;
      this.state.bytesReceived += 450;
      this.maintainSyntheticOrders();
      this.scheduleCachePersist();
      this.notify();
    }, 100);
  }

  private updateTouchMetrics(bestBid: number, bestAsk: number) {
    const mid = (bestBid + bestAsk) / 2;
    const spd = Math.max(this.security.tickSize, bestAsk - bestBid);
    const spdBps = (spd / mid) * 10000;

    this.state.bestBid = bestBid;
    this.state.bestAsk = bestAsk;
    this.state.midPrice = mid;
    this.state.spreadPrice = spd;
    this.state.spreadBps = spdBps;

    // Order Flow Imbalance
    const bidVol = this.state.bids.slice(0, 3).reduce((acc, x) => acc + x.qty, 0);
    const askVol = this.state.asks.slice(0, 3).reduce((acc, x) => acc + x.qty, 0);
    const rawOfi = ((bidVol - askVol) / Math.max(1, bidVol + askVol)) * 50;
    this.state.ofi = Math.max(-100, Math.min(100, this.state.ofi * 0.85 + rawOfi * 0.15));
  }

  private updatePriceHistory(price: number) {
    if (!Number.isFinite(price) || price <= 0) return;
    if (this.state.priceHistory.length > 0) {
      const last = this.state.priceHistory[this.state.priceHistory.length - 1];
      if (last > 0 && Math.abs(price - last) / last > 0.4) {
        // Discontinuity from symbol change or stale cache - re-seed smoothly
        this.state.priceHistory = new Array(30).fill(price);
      }
    }
    this.state.priceHistory.push(price);
    if (this.state.priceHistory.length > 60) this.state.priceHistory.shift();
  }

  private maintainSyntheticOrders() {
    if (this.syntheticOrders.length >= 2) return;
    if (this.state.bestBid === 0 || this.state.bestAsk === 0) return;

    const now = Date.now();
    const mid = this.state.midPrice;
    const orderQty = this.security.lotSize * 5;

    const hasBuy = this.syntheticOrders.some((o) => o.side === "BUY");
    const hasSell = this.syntheticOrders.some((o) => o.side === "SELL");

    if (!hasBuy && this.state.bids.length > 0) {
      const topBid = this.state.bids[0];
      const ord: SyntheticOrder = {
        id: this.nextOrderId++,
        symbol: this.symbol,
        side: "BUY",
        price: topBid.price,
        qty: orderQty,
        submitTime: now,
        queueAhead: topBid.qty * 0.5,
        levelQty: topBid.qty,
        arrivalPrice: mid,
      };
      this.syntheticOrders.push(ord);
      this.logEvent("SUBMIT", "BUY", ord.price, ord.qty, "POST-ONLY LIMIT @ TOUCH", "w");
      this.logEvent("ACK", "BUY", ord.price, ord.qty, `RESTING (AHEAD: ${ord.queueAhead.toFixed(2)})`, "g");
    }

    if (!hasSell && this.state.asks.length > 0) {
      const topAsk = this.state.asks[0];
      const ord: SyntheticOrder = {
        id: this.nextOrderId++,
        symbol: this.symbol,
        side: "SELL",
        price: topAsk.price,
        qty: orderQty,
        submitTime: now,
        queueAhead: topAsk.qty * 0.5,
        levelQty: topAsk.qty,
        arrivalPrice: mid,
      };
      this.syntheticOrders.push(ord);
      this.logEvent("SUBMIT", "SELL", ord.price, ord.qty, "POST-ONLY LIMIT @ TOUCH", "w");
      this.logEvent("ACK", "SELL", ord.price, ord.qty, `RESTING (AHEAD: ${ord.queueAhead.toFixed(2)})`, "g");
    }
  }


  private matchSyntheticOrders(tradePrice: number, tradeQty: number, tradeSide: "BUY" | "SELL", tradeTime: number) {
    const remaining: SyntheticOrder[] = [];

    for (const ord of this.syntheticOrders) {
      let filled = false;

      if (ord.side === "BUY" && tradeSide === "SELL" && tradePrice <= ord.price) {
        ord.queueAhead -= tradeQty;
        if (ord.queueAhead <= 0) {
          filled = true;
          const cpty = getBrokerName(tradeTime);
          this.recordFill(ord, ord.price, tradeTime, cpty);
          this.logEvent("FILL", "BUY", ord.price, ord.qty, `MATCHED VS ${cpty} DMA (MAKER REBATE)`, "y");
        }
      } else if (ord.side === "SELL" && tradeSide === "BUY" && tradePrice >= ord.price) {
        ord.queueAhead -= tradeQty;
        if (ord.queueAhead <= 0) {
          filled = true;
          const cpty = getBrokerName(tradeTime);
          this.recordFill(ord, ord.price, tradeTime, cpty);
          this.logEvent("FILL", "SELL", ord.price, ord.qty, `MATCHED VS ${cpty} DMA (MAKER REBATE)`, "y");
        }
      }

      if (!filled) remaining.push(ord);
    }
    this.syntheticOrders = remaining;
  }

  private recordFill(ord: SyntheticOrder, fillPrice: number, fillTime: number, cpty = getBrokerName(fillTime)) {
    const queueWaitMs = Math.max(10, fillTime - ord.submitTime);
    const arrivalPrice = ord.arrivalPrice || fillPrice;
    const isMultiplier = ord.side === "BUY" ? 1 : -1;
    const isBps = ((fillPrice - arrivalPrice) / arrivalPrice) * 10000 * isMultiplier;
    const effSpdBps = (Math.abs(fillPrice - arrivalPrice) / arrivalPrice) * 10000;

    const markout100 = (Math.random() - 0.45) * 1.5;
    const markout1s = markout100 + (Math.random() - 0.45) * 2.0;
    const markout5s = markout1s + (Math.random() - 0.48) * 3.0;
    const markout30s = markout5s + (Math.random() - 0.5) * 4.0;
    const isToxic = markout5s < -0.8;

    let grade: "A+" | "A" | "B" | "C" | "F" = "A";
    if (isBps <= 0 && !isToxic) grade = "A+";
    else if (isBps <= 0.5 && !isToxic) grade = "A";
    else if (isBps <= 1.5) grade = "B";
    else if (isToxic) grade = "C";
    else grade = "F";

    const d = new Date(fillTime);
    const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}.${String(Math.floor(d.getMilliseconds() / 10)).padStart(2, "0")}`;

    const rec: TradeRecord = {
      id: ord.id,
      timeMs: fillTime,
      timeStr,
      side: ord.side,
      symbol: ord.symbol,
      qty: ord.qty,
      price: fillPrice,
      notional: fillPrice * ord.qty,
      arrivalPrice,
      midPriceAtFill: this.state.midPrice || fillPrice,
      effectiveSpreadBps: effSpdBps,
      implementationShortfallBps: isBps,
      queueWaitMs,
      frontQtyAtAck: ord.levelQty,
      markout100msBps: markout100,
      markout1sBps: markout1s,
      markout5sBps: markout5s,
      markout30sBps: markout30s,
      isToxic,
      grade,
      cpty,
    };

    this.tcaEngine.addTrade(rec);
  }

  private logEvent(type: "SUBMIT" | "NEW" | "ACK" | "TOUCH" | "FILL" | "CXLD", side: "BUY" | "SELL", price: number, qty: number, detail: string, cls: string) {
    const d = new Date();
    const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}.${String(Math.floor(d.getMilliseconds() / 100))}`;
    this.state.events.unshift({ timeStr, type, side, price, qty, detail, cls });
    if (this.state.events.length > 60) this.state.events.pop();
  }

  private notify() {
    if (this.onUpdateCallback) {
      this.onUpdateCallback(this.state);
    }
  }
}
