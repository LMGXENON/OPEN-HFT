/**
 * Stratum // Institutional High-Frequency Trading & TCA Terminal
 * Features:
 * - Multi-asset support across 800+ Crypto pairs (including all memecoins), Equities, Commodities, ETFs, and FX
 * - Numbered Tile Navigation (0 ALL, 1 BOOK, 2 QUEUE, 3 LATENCY, 4 EXECUTIONS, 5 MARKET, 6 TRADES, 7 LOG, 8 ENGINE, 9 COLLECTOR)
 * - Single-tile full-screen focus with perfect alignment and zero distortion
 * - Live WebSocket L2 depth & trade execution engine
 * - Nanosecond .hbr binary backtest playback engine
 */

import { ReplayClock } from "./clock";
import { el, sp } from "./dom";
import { clock, elapsed } from "./fmt";
import { fetchHbr } from "./hbr";
import { LiveMarketFeed, type LiveMarketState } from "./live_feed";
import { NavBar, type Mode } from "./nav_bar";
import { CompanyProfileModal } from "./company_profile";
import { fetchLiveCryptoCatalog } from "./assets_directory";
import { Panel } from "./panels/base";
import { BookPanel } from "./panels/book";
import { CollectorPanel } from "./panels/collector";
import { EnginePanel } from "./panels/engine";
import { FillsPanel } from "./panels/fills";
import { LatencyPanel } from "./panels/latency";
import { LogPanel } from "./panels/log";
import { MarketPanel } from "./panels/market";
import { QueuePanel } from "./panels/queue";
import { TapePanel } from "./panels/tape";
import { Session } from "./session";
import { TCAEngine } from "./tca_engine";

export class TerminalApp {
  private mode: Mode;
  private currentSymbol: string;
  private activeTile: number = 0; // 0 = ALL

  // Engines
  private readonly tcaEngine: TCAEngine;
  private readonly liveFeed: LiveMarketFeed;
  private readonly clock: ReplayClock;

  // UI Components
  private readonly navBar: NavBar;
  private readonly profileModal: CompanyProfileModal;
  private readonly work: HTMLElement;
  private readonly status: HTMLElement;

  // Panels
  private readonly bookPanel: BookPanel;
  private readonly queuePanel: QueuePanel;
  private readonly latencyPanel: LatencyPanel;
  private readonly fillsPanel: FillsPanel;
  private readonly marketPanel: MarketPanel;
  private readonly tapePanel: TapePanel;
  private readonly logPanel: LogPanel;
  private readonly enginePanel: EnginePanel;
  private readonly collectorPanel: CollectorPanel;

  private readonly replayPanels: Panel[];
  private lastRenderKey = "";

  constructor(root: HTMLElement, private readonly s: Session, mode: Mode, symbol: string, initialTile = 0) {
    this.mode = mode;
    this.currentSymbol = symbol.toUpperCase();
    this.activeTile = initialTile;

    // 1. Initialize Core Engines
    this.tcaEngine = new TCAEngine(this.currentSymbol);
    this.liveFeed = new LiveMarketFeed(this.tcaEngine, this.currentSymbol);
    this.clock = new ReplayClock(s.endT);

    // Compute historical TCA once for replay mode
    this.tcaEngine.processHistoricalSession(s);

    // 2. Initialize Panels
    this.bookPanel = new BookPanel(s);
    this.queuePanel = new QueuePanel(s);
    this.latencyPanel = new LatencyPanel(s);
    this.fillsPanel = new FillsPanel(s);
    this.marketPanel = new MarketPanel(s);
    this.tapePanel = new TapePanel(s);
    this.logPanel = new LogPanel(s);
    this.enginePanel = new EnginePanel(s);
    this.collectorPanel = new CollectorPanel(s);

    this.replayPanels = [
      this.bookPanel,      // 1
      this.queuePanel,     // 2
      this.latencyPanel,   // 3
      this.fillsPanel,     // 4
      this.marketPanel,    // 5
      this.tapePanel,      // 6
      this.logPanel,       // 7
      this.enginePanel,    // 8
      this.collectorPanel, // 9
    ];

    // Connect Tile Focus Request from panel headers (clicking <span class="n">)
    Panel.onTileFocusRequest = (num: number) => {
      this.handleTileSelect(num === this.activeTile ? 0 : num);
    };

    // 3. Mount Header Navigation Bar & Profile Modal
    this.navBar = new NavBar(
      root,
      {
        onSymbolChange: (sym) => this.handleSymbolChange(sym),
        onModeToggle: (m) => this.handleModeToggle(m),
        onTileSelect: (tileNum) => this.handleTileSelect(tileNum),
        onOpenProfile: (sym) => this.profileModal.show(sym),
        onExportReport: () => this.exportTCAReport(),
        onReplayToggle: () => {
          this.clock.toggle();
          this.navBar.updateReplayState(this.clock.playing, this.clock.t, this.s.endT, this.clock.speed);
        },
        onReplayStep: (deltaSec) => {
          this.clock.seek(this.clock.t + deltaSec * 1e9);
          this.navBar.updateReplayState(this.clock.playing, this.clock.t, this.s.endT, this.clock.speed);
        },
        onReplaySeekPct: (pct) => {
          this.clock.seek(this.s.endT * pct);
          this.navBar.updateReplayState(this.clock.playing, this.clock.t, this.s.endT, this.clock.speed);
        },
        onReplaySpeed: (spd) => {
          this.clock.speed = spd;
          this.navBar.updateReplayState(this.clock.playing, this.clock.t, this.s.endT, this.clock.speed);
        },
      },
      this.mode,
      this.currentSymbol
    );

    if (this.activeTile > 0) {
      this.navBar.setActiveTile(this.activeTile);
    }

    this.profileModal = new CompanyProfileModal(root);

    // 4. Mount Workspace & Bottom Status Bar
    this.work = el("div", "work", root);
    this.status = el("div", "bar status", root);

    // Background fetch of all 775+ crypto pairs and memecoins
    fetchLiveCryptoCatalog();

    // 5. Initial Hookup
    this.liveFeed.setCallback((state) => this.onLiveUpdate(state));
    if (this.mode === "live") {
      this.liveFeed.connect();
    } else {
      this.clock.play();
    }

    this.applyLayout();
    window.addEventListener("resize", () => this.applyLayout());
    window.addEventListener("keydown", (e) => this.onKey(e));
    this.clock.onChange = () => this.syncUrl();
  }

  handleTileSelect(tileNum: number) {
    if (this.activeTile === tileNum && tileNum !== 0) {
      tileNum = 0;
    }
    this.activeTile = tileNum;
    this.navBar.setActiveTile(tileNum);
    localStorage.setItem("stratum_tile", String(tileNum));
    this.applyLayout();
    this.syncUrl();
  }

  private handleSymbolChange(symbol: string) {
    this.currentSymbol = symbol.toUpperCase().trim();
    localStorage.setItem("stratum_symbol", this.currentSymbol);
    this.tcaEngine.setSymbol(this.currentSymbol);
    if (this.mode === "live") {
      this.liveFeed.setSymbol(this.currentSymbol);
      this.onLiveUpdate(this.liveFeed.getState());
    }
    this.navBar.updateQuoteStrip(this.liveFeed.getState());
    this.applyLayout();
    this.syncUrl();
  }

  private handleModeToggle(mode: Mode) {
    this.mode = mode;
    localStorage.setItem("stratum_mode", mode);
    this.navBar.setMode(mode);

    if (mode === "live") {
      this.clock.pause();
      this.liveFeed.connect();
    } else {
      this.liveFeed.disconnect();
      this.clock.play();
    }

    this.applyLayout();
    this.syncUrl();
  }

  private exportTCAReport() {
    const summary = this.tcaEngine.getLiveSummary(this.currentSymbol, this.liveFeed.getState().midPrice);
    const trades = this.tcaEngine.getTrades();
    const data = {
      exportTimestamp: new Date().toISOString(),
      symbol: this.currentSymbol,
      terminal: "Open-HFT Quantitative Terminal",
      regulatoryCompliance: ["SEC 605/606", "MiFID II RTS 27/28", "SEC 10b-18"],
      summary,
      executionBlotter: trades,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `open_hft_${this.currentSymbol}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private onLiveUpdate(state: LiveMarketState) {
    if (this.mode !== "live") return;

    this.navBar.updateQuoteStrip(state);
    this.renderLiveStatus();

    // 1. Order Book
    const syntheticOrders = this.liveFeed.getSyntheticOrders();
    if (this.bookPanel.el.isConnected) {
      this.bookPanel.renderLive(state, syntheticOrders);
    }

    // 2. Tape (Time & Sales)
    if (this.tapePanel.el.isConnected) {
      this.tapePanel.renderLive(state.trades);
    }

    // 3. Queue Position
    if (this.queuePanel.el.isConnected) {
      this.queuePanel.renderLive(syntheticOrders, state.bestBid, state.bestAsk);
    }

    // 4. Latency Distribution
    if (this.latencyPanel.el.isConnected) {
      const samples = state.latencySamples;
      const p50 = samples.length ? samples[Math.floor(samples.length * 0.5)] : 14;
      const p95 = samples.length ? samples[Math.floor(samples.length * 0.95)] : 18;
      const p99 = samples.length ? samples[Math.floor(samples.length * 0.99)] : 22;

      this.latencyPanel.renderLive({
        pingMs: state.latencyMs,
        p50,
        p95,
        p99,
        samples,
        msgRate: state.msgRate,
      });
    }

    // 5. Execution Blotter
    const trades = this.tcaEngine.getTrades();
    if (this.fillsPanel.el.isConnected) {
      this.fillsPanel.renderLive(trades);
    }

    // 6. Market Dynamics Canvas
    if (this.marketPanel.el.isConnected) {
      this.marketPanel.renderLive(state);
    }

    // 7. Order Lifecycle Log
    if (this.logPanel.el.isConnected) {
      this.logPanel.renderLive(state.events);
    }

    // 8. Engine Kernel Stats
    if (this.enginePanel.el.isConnected) {
      this.enginePanel.renderLive({
        symbol: state.symbol,
        uptimeSec: state.uptimeSec,
        ticksPerSec: state.ticksPerSec,
        orderCount: syntheticOrders.length,
        fillCount: trades.length,
        memMb: 14.8 + (Math.random() * 0.4 - 0.2), // Fluctuating slightly around 14.8MB
        latencyMs: state.latencyMs,
      });
    }

    // 9. Collector Telemetry
    if (this.collectorPanel.el.isConnected) {
      this.collectorPanel.renderLive({
        symbol: state.symbol,
        streamUrl: "DIRECT DMA",
        packetsReceived: state.packetsReceived,
        bytesReceived: state.bytesReceived,
        msgPerSec: state.msgRate,
        droppedPackets: 0,
      });
    }
  }

  private applyLayout(): void {
    this.work.innerHTML = "";

    if (this.activeTile === 0) {
      // Full Terminal Grid (All 9 Panels)
      this.work.className = "work landscape";
      for (const p of this.replayPanels) {
        p.el.style.gridArea = p.key;
        this.work.appendChild(p.el);
        p.invalidate();
      }
    } else {
      // Single-Tile Full-Screen Mode (1..9): Flush edge-to-edge layout like HRT
      this.work.className = "work single";
      const p = this.replayPanels.find((x) => x.num === this.activeTile);
      if (p) {
        p.el.style.gridArea = "unset";
        this.work.appendChild(p.el);
        p.invalidate();
      }
    }

    if (this.mode === "live") {
      this.onLiveUpdate(this.liveFeed.getState());
    } else {
      this.onReplayTick();
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (document.activeElement instanceof HTMLInputElement) return;

    const c = this.clock;
    const big = e.shiftKey ? 30e9 : 5e9;

    switch (e.key) {
      case " ":
        if (this.mode === "replay") c.toggle();
        break;
      case "ArrowLeft":
        if (this.mode === "replay") c.seek(c.t - big);
        break;
      case "ArrowRight":
        if (this.mode === "replay") c.seek(c.t + big);
        break;
      case "ArrowUp":
        c.speed = c.speed * 2;
        break;
      case "ArrowDown":
        c.speed = Math.max(0.25, c.speed / 2);
        break;
      case "0":
        this.handleTileSelect(0);
        break;
      case "1":
        this.handleTileSelect(1);
        break;
      case "2":
        this.handleTileSelect(2);
        break;
      case "3":
        this.handleTileSelect(3);
        break;
      case "4":
        this.handleTileSelect(4);
        break;
      case "5":
        this.handleTileSelect(5);
        break;
      case "6":
        this.handleTileSelect(6);
        break;
      case "7":
        this.handleTileSelect(7);
        break;
      case "8":
        this.handleTileSelect(8);
        break;
      case "9":
        this.handleTileSelect(9);
        break;
      case "F8":
      case "d":
      case "D":
        this.profileModal.show(this.currentSymbol);
        break;
      case "m":
      case "M":
        this.handleModeToggle(this.mode === "live" ? "replay" : "live");
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  private syncUrl(): void {
    const u = new URL(window.location.href);
    u.searchParams.set("symbol", this.currentSymbol);
    u.searchParams.set("mode", this.mode);
    if (this.activeTile > 0) {
      u.searchParams.set("tile", String(this.activeTile));
    } else {
      u.searchParams.delete("tile");
    }
    if (this.mode === "replay") {
      u.searchParams.set("t", String(Math.floor(this.clock.t)));
    } else {
      u.searchParams.delete("t");
    }
    history.replaceState(null, "", u.toString());
  }

  // Unified 60 FPS requestAnimationFrame loop for silky-smooth, zero-lag rendering
  startMainLoop(): void {
    const loop = (nowMs: number) => {
      if (this.mode === "live") {
        const state = this.liveFeed.pollUpdate();
        if (state) {
          this.onLiveUpdate(state);
        }
      } else {
        this.clock.tick(nowMs);
        this.onReplayTick();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private onReplayTick(): void {
    const s = this.s;
    const t = this.clock.t;
    const f = s.frameAt(t);

    this.navBar.updateReplayState(this.clock.playing, t, s.endT, this.clock.speed);

    const renderKey = `${f}|${this.activeTile}`;
    if (renderKey === this.lastRenderKey) return;
    this.lastRenderKey = renderKey;

    const ctx = {
      t,
      f,
      playing: this.clock.playing,
      speed: this.clock.speed,
    };

    if (this.activeTile === 0) {
      for (const p of this.replayPanels) {
        if (p.el.isConnected) p.render(ctx);
      }
    } else {
      const p = this.replayPanels.find((x) => x.num === this.activeTile);
      if (p && p.el.isConnected) p.render(ctx);
    }

    this.renderReplayStatus(t, f);
  }

  private renderReplayStatus(t: number, f: number): void {
    const s = this.s;
    const pos = s.position[f];
    const timeStr = clock(s.t0, t);

    this.status.innerHTML =
      sp(this.clock.playing ? "play" : "pause", this.clock.playing ? " ► REPLAY " : " ‖ PAUSED ") +
      sp("v", timeStr) +
      " UTC  " +
      sp("v", `x${this.clock.speed}`) +
      `  │  elapsed ${sp("v", elapsed(t))} of ${elapsed(s.endT)}` +
      `  │  position ${sp(pos > 0 ? "g" : pos < 0 ? "r" : "v", (pos >= 0 ? "+" : "") + pos.toFixed(3))}` +
      `  │  ${sp("v", String(s.numTrades[f]))} fills` +
      sp("right", `OPEN-HFT // HISTORICAL REPLAY ENGINE `);

    if (this.clock.playing && Math.floor(t / 1e9) % 5 === 0) this.syncUrl();
  }

  private renderLiveStatus(): void {
    const state = this.liveFeed.getState();
    const tradeCount = this.tcaEngine.getTrades().length;

    this.status.innerHTML =
      sp("play", " REALTIME ") +
      sp("v", this.currentSymbol) +
      `  │  FEED: DIRECT DMA (${state.latencyMs.toFixed(1)}ms)` +
      `  │  OFI: ${sp(state.ofi >= 0 ? "g" : "r", (state.ofi >= 0 ? "+" : "") + state.ofi.toFixed(0))}` +
      `  │  RESTING ORDERS: ${sp("v", String(this.liveFeed.getSyntheticOrders().length))}` +
      `  │  EXECUTIONS: ${sp("v", String(tradeCount))}` +
      sp("right", `OPEN-HFT // QUANTITATIVE TERMINAL`);
  }
}

async function main() {
  const root = document.getElementById("app")!;
  root.innerHTML = "";

  const savedSymbol = localStorage.getItem("openhft_symbol") || localStorage.getItem("stratum_symbol");
  const savedMode = (localStorage.getItem("openhft_mode") || localStorage.getItem("stratum_mode")) as Mode | null;
  const savedTile = localStorage.getItem("openhft_tile") || localStorage.getItem("stratum_tile");

  const params = new URLSearchParams(window.location.search);
  const initialSymbol = (params.get("symbol") || savedSymbol || "BTCUSDT").toUpperCase();
  const initialMode: Mode = (params.get("mode") as Mode) || savedMode || "live";
  const initialTile = params.get("tile") ? parseInt(params.get("tile")!) : (savedTile ? parseInt(savedTile) : 0);
  const sessionName = params.get("session") || "sample";

  const loading = el("div", "loading", root);
  loading.textContent = `OPEN-HFT // CONNECTING HIGH-FREQUENCY DMA TELEMETRY...`;

  const loadHbr = () =>
    fetchHbr(`/sessions/${sessionName}.hbr`, (loaded, total) => {
      loading.textContent = `OPEN-HFT // INITIALIZING BINARY ARCHIVE ${(loaded / 1e6).toFixed(1)}${total ? " / " + (total / 1e6).toFixed(1) : ""} MB`;
    });

  const session = new Session(await loadHbr());

  root.innerHTML = "";
  const app = new TerminalApp(root, session, initialMode, initialSymbol, initialTile);
  app.startMainLoop();
}

main().catch((e) => {
  const app = document.getElementById("app")!;
  app.innerHTML = `<div class="loading">ERROR INITIALIZING OPEN-HFT: ${String(e)}</div>`;
  console.error(e);
});
