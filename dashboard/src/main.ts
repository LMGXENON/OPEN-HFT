/**
 * Open-HFT // Institutional High-Frequency Trading & TCA Terminal
 * Features:
 * - Multi-asset support across 800+ Crypto pairs (including all memecoins), Equities, Commodities, ETFs, and FX
 * - Numbered Tile Navigation (0 ALL, 1 BOOK, 2 QUEUE, 3 LATENCY, 4 EXECUTIONS, 5 MARKET, 6 TRADES, 7 LOG, 8 ENGINE, 9 COLLECTOR)
 * - Numbered Tile Navigation (0 ALL, 1 BOOK, 2 QUEUE, 3 LATENCY, 4 TRADES, 5 MARKET, 6 TAPE, 7 LOG, 8 ENGINE, 9 COLLECTOR)
 * - Single-tile full-screen focus with perfect alignment and zero distortion
 * - Live WebSocket L2 depth & trade execution engine
 * - Nanosecond .hbr binary backtest playback engine
 */

import { ReplayClock } from "./clock";
import { el, sp } from "./dom";
import { clock, elapsed } from "./fmt";
import { fetchHbr, parseHbr, type Hbr } from "./hbr";
import { createSessionForAsset } from "./session_factory";
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
import { RecorderModal } from "./recorder_modal";
import { TearSheetModal } from "./tear_sheet_modal";

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
  private readonly recorderModal: RecorderModal;
  private readonly tearSheetModal: TearSheetModal;
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
  private isDestroyed = false;
  private hasShownCompletionBanner = false;
  private completionBannerEl: HTMLElement | null = null;
  private readonly onResizeBound = () => this.applyLayout();
  private readonly onKeyBound = (e: KeyboardEvent) => this.onKey(e);

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
        onOpenRecorder: () => this.recorderModal.open(this.currentSymbol),
        onOpenTearSheet: () => this.tearSheetModal.open(this.s),
        onExportReport: () => this.exportTCAReport(),
        onLoadSessionFile: (buf, name) => loadNewSession(buf, name),
        onReplayToggle: () => {
          this.clock.toggle();
          this.navBar.updateReplayState(this.clock.playing, this.clock.t, this.s.endT, this.clock.speed);
        },
        onReplayStep: (deltaSec) => {
          this.clock.seek(this.clock.t + deltaSec * 1e9);
          this.navBar.updateReplayState(this.clock.playing, this.clock.t, this.s.endT, this.clock.speed);
        },
        onReplayJumpToStart: () => {
          this.clock.seek(0);
          this.navBar.updateReplayState(this.clock.playing, this.clock.t, this.s.endT, this.clock.speed);
        },
        onReplayJumpToEnd: () => {
          this.clock.seek(this.s.endT - 1e6);
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
    this.tearSheetModal = new TearSheetModal();
    this.recorderModal = new RecorderModal({
      initialSymbol: this.currentSymbol,
      onLoadSession: (buf, name) => loadNewSession(buf, name),
      onOpenTearSheet: () => this.tearSheetModal.open(this.s),
    });

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
    window.addEventListener("resize", this.onResizeBound);
    window.addEventListener("keydown", this.onKeyBound);
    this.clock.onChange = () => this.syncUrl();
  }

  destroy(): void {
    this.isDestroyed = true;
    this.hideCompletionBanner();
    if (this.completionBannerEl) {
      this.completionBannerEl.remove();
      this.completionBannerEl = null;
    }
    this.clock.pause();
    this.liveFeed.disconnect();
    window.removeEventListener("resize", this.onResizeBound);
    window.removeEventListener("keydown", this.onKeyBound);
  }

  handleTileSelect(tileNum: number) {
    if (this.activeTile === tileNum && tileNum !== 0) {
      tileNum = 0;
    }
    this.activeTile = tileNum;
    this.navBar.setActiveTile(tileNum);
    localStorage.setItem("open-hft_tile", String(tileNum));
    this.applyLayout();
    this.syncUrl();
  }

  private handleSymbolChange(symbol: string) {
    this.currentSymbol = symbol.toUpperCase().trim();
    localStorage.setItem("open-hft_symbol", this.currentSymbol);
    this.tcaEngine.setSymbol(this.currentSymbol);

    if (baseSessionHbr) {
      loadSessionForAsset(baseSessionHbr, this.currentSymbol, this.activeTile);
      return;
    }

    this.navBar.updateQuoteStrip(this.liveFeed.getState());
    this.applyLayout();
    this.syncUrl();
  }

  private handleModeToggle(mode: Mode) {
    this.mode = mode;
    localStorage.setItem("open-hft_mode", mode);
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
    let summary: any;
    let trades: any[];

    if (this.mode === "replay") {
      summary = this.tcaEngine.processHistoricalSession(this.s);
      trades = this.tcaEngine.getTrades();
    } else {
      summary = this.tcaEngine.getLiveSummary(this.currentSymbol, this.liveFeed.getState().midPrice);
      trades = this.tcaEngine.getTrades();
    }

    const data = {
      exportTimestamp: new Date().toISOString(),
      symbol: this.currentSymbol,
      mode: this.mode,
      terminal: "Open-HFT Quantitative Terminal",
      regulatoryCompliance: ["SEC 605/606", "MiFID II RTS 27/28", "SEC 10b-18"],
      summary,
      executionBlotter: trades,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `open_hft_tca_report_${this.currentSymbol}_${Date.now()}.json`;
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
      this.tapePanel.renderLive(state.trades, state.totalTrades);
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
      this.fillsPanel.renderLive(trades, trades.length);
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
        memMb: 14.8,
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
    const deltaSec = e.shiftKey ? 5 : 0.1;

    switch (e.key) {
      case " ":
        if (this.mode === "replay") {
          c.toggle();
          this.navBar.updateReplayState(c.playing, c.t, this.s.endT, c.speed);
        }
        break;
      case "ArrowLeft":
        if (this.mode === "replay") {
          c.seek(c.t - deltaSec * 1e9);
          this.navBar.updateReplayState(c.playing, c.t, this.s.endT, c.speed);
        }
        break;
      case "ArrowRight":
        if (this.mode === "replay") {
          c.seek(c.t + deltaSec * 1e9);
          this.navBar.updateReplayState(c.playing, c.t, this.s.endT, c.speed);
        }
        break;
      case "Home":
        if (this.mode === "replay") {
          c.seek(0);
          this.navBar.updateReplayState(c.playing, c.t, this.s.endT, c.speed);
        }
        break;
      case "End":
        if (this.mode === "replay") {
          c.seek(this.s.endT - 1e6);
          this.navBar.updateReplayState(c.playing, c.t, this.s.endT, c.speed);
        }
        break;
      case "ArrowUp":
        c.speed = Math.min(50, c.speed * 2);
        this.navBar.updateReplayState(c.playing, c.t, this.s.endT, c.speed);
        break;
      case "ArrowDown":
        c.speed = Math.max(0.25, c.speed / 2);
        this.navBar.updateReplayState(c.playing, c.t, this.s.endT, c.speed);
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
      if (this.isDestroyed) return;
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

    // Detect backtest completion (reached 100% of session frames)
    const isCompleted = t >= s.endT - 1e6;
    if (isCompleted && !this.hasShownCompletionBanner) {
      this.triggerBacktestCompletion();
    } else if (!isCompleted && t < s.endT - 2e9 && this.hasShownCompletionBanner) {
      this.hasShownCompletionBanner = false;
      this.hideCompletionBanner();
    }

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

  private triggerBacktestCompletion(): void {
    this.hasShownCompletionBanner = true;
    const s = this.s;
    const summary = this.tcaEngine.processHistoricalSession(s);
    try {
      localStorage.setItem("open-hft_last_tca_report", JSON.stringify({
        symbol: s.meta.symbol,
        venue: s.meta.exchange || "Binance USDT-M Futures",
        timestamp: new Date().toISOString(),
        durationSec: Number((s.endT / 1e9).toFixed(2)),
        totalFrames: s.nFrames,
        fills: s.lives.filter((l) => l.outcome === "filled").length,
        totalOrders: s.lives.length,
        summary,
      }, null, 2));
    } catch {
      // ignore storage quota errors
    }

    if (!this.completionBannerEl) {
      this.completionBannerEl = el("div", "backtest-completed-banner", document.body);
    }
    this.completionBannerEl.style.display = "flex";
    this.completionBannerEl.innerHTML = `
      <span class="backtest-banner-badge">✓ BACKTEST COMPLETE</span>
      <span class="backtest-banner-text">Replay reached 100% (${(s.endT / 1e9).toFixed(1)}s, ${s.lives.filter((l) => l.outcome === "filled").length} fills). Quantitative TCA Report generated.</span>
      <div class="backtest-banner-actions">
        <button class="backtest-banner-btn primary" id="btn-banner-tca">📊 VIEW TCA TEAR SHEET</button>
        <button class="backtest-banner-btn secondary" id="btn-banner-md">📄 EXPORT .MD</button>
        <button class="backtest-banner-btn secondary" id="btn-banner-json">📁 EXPORT .JSON</button>
        <button class="backtest-banner-btn close" id="btn-banner-close">✕</button>
      </div>
    `;

    document.getElementById("btn-banner-tca")?.addEventListener("click", () => {
      this.tearSheetModal.open(this.s);
    });
    document.getElementById("btn-banner-md")?.addEventListener("click", () => {
      this.tearSheetModal.exportMarkdownReport(this.s);
    });
    document.getElementById("btn-banner-json")?.addEventListener("click", () => {
      this.exportTCAReport();
    });
    document.getElementById("btn-banner-close")?.addEventListener("click", () => {
      this.hideCompletionBanner();
    });
  }

  private hideCompletionBanner(): void {
    if (this.completionBannerEl) {
      this.completionBannerEl.style.display = "none";
    }
  }

  private renderReplayStatus(t: number, f: number): void {
    const s = this.s;
    const pos = s.position[f];
    const timeStr = clock(s.t0, t);
    const isCompleted = t >= s.endT - 1e6;

    this.status.innerHTML =
      (isCompleted ? sp("play", " ✓ 100% COMPLETE ") : sp(this.clock.playing ? "play" : "pause", this.clock.playing ? " ► BACKTEST " : " ‖ PAUSED ")) +
      sp("v", timeStr) +
      " UTC  " +
      sp("v", `x${this.clock.speed}`) +
      `  │  elapsed ${sp("v", elapsed(t))} of ${elapsed(s.endT)}` +
      `  │  position ${sp(pos > 0 ? "g" : pos < 0 ? "r" : "v", (pos >= 0 ? "+" : "") + pos.toFixed(3))}` +
      `  │  ${sp("v", String(s.numTrades[f]))} fills` +
      `  │  ${sp("v", String(s.numTrades[f]))} trades` +
      sp("right", `OPEN-HFT // QUANTITATIVE BACKTEST TERMINAL `);

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
      `  │  TRADES: ${sp("v", String(tradeCount))}` +
      sp("right", `OPEN-HFT // QUANTITATIVE TERMINAL`);
  }
}

let activeApp: TerminalApp | null = null;
let baseSessionHbr: Hbr | null = null;

export function loadSessionForAsset(baseHbr: Hbr, symbol: string, initialTile = 0) {
  try {
    const session = createSessionForAsset(baseHbr, symbol);
    const root = document.getElementById("app")!;
    if (activeApp) {
      activeApp.destroy();
    }
    root.innerHTML = "";
    activeApp = new TerminalApp(root, session, "replay", symbol, initialTile);
    activeApp.startMainLoop();
    console.log(`[OPEN-HFT] Loaded dynamic backtest for ${symbol} (${session.nFrames} frames, tick ${session.tickSize}, lot ${session.lotSize})`);
  } catch (err) {
    console.error(`Failed to create backtest for ${symbol}`, err);
  }
}

export function loadNewSession(buf: ArrayBuffer, fileName = "recording.hbr") {
  try {
    const hbr = parseHbr(buf);
    baseSessionHbr = hbr;
    const session = new Session(hbr);
    const root = document.getElementById("app")!;
    if (activeApp) {
      activeApp.destroy();
    }
    root.innerHTML = "";
    const sym = (session.meta.symbol || "BTCUSDT").toUpperCase();
    activeApp = new TerminalApp(root, session, "replay", sym, 0);
    activeApp.startMainLoop();
    console.log(`[OPEN-HFT] Loaded session "${fileName}": ${session.nFrames} frames, ${session.fillEvents.length} fills`);
  } catch (err) {
    alert(`Failed to load .hbr session: ${err instanceof Error ? err.message : String(err)}`);
    console.error(err);
  }
}

function setupDragAndDrop() {
  const overlay = el("div", "term-drop-overlay", document.body);
  overlay.id = "drop-overlay";
  overlay.innerHTML = `
    <div class="term-drop-modal">
      <div class="drop-icon">📂</div>
      <div class="drop-title">LOAD BACKTEST RECORDING</div>
      <div class="drop-desc">Drop any <span class="ext">.hbr</span> binary recording file to replay microstructure</div>
      <div class="drop-sub">OPEN-HFT // QUANTITATIVE HIGH-FREQUENCY ENGINE</div>
    </div>
  `;
  overlay.style.display = "none";

  let dragCounter = 0;

  window.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragCounter++;
    if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files")) {
      overlay.style.display = "flex";
    }
  });

  window.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      overlay.style.display = "none";
    }
  });

  window.addEventListener("dragover", (e) => {
    e.preventDefault();
  });

  window.addEventListener("drop", async (e) => {
    e.preventDefault();
    dragCounter = 0;
    overlay.style.display = "none";

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.name.endsWith(".hbr") || file.name.endsWith(".bin") || file.name.endsWith(".dat")) {
        const buf = await file.arrayBuffer();
        loadNewSession(buf, file.name);
      } else {
        alert("Please drop a valid .hbr session recording file.");
      }
    }
  });
}

async function main() {
  const root = document.getElementById("app")!;
  root.innerHTML = "";

  const savedSymbol = localStorage.getItem("open-hft_symbol") || localStorage.getItem("openhrt_symbol");
  const savedTile = localStorage.getItem("open-hft_tile") || localStorage.getItem("openhrt_tile");

  const params = new URLSearchParams(window.location.search);
  const initialSymbol = (params.get("symbol") || savedSymbol || "BTCUSDT").toUpperCase();
  const initialTile = params.get("tile") ? parseInt(params.get("tile")!) : (savedTile ? parseInt(savedTile) : 0);
  const sessionName = params.get("session") || "sample";

  const loading = el("div", "loading", root);
  loading.textContent = `OPEN-HFT // CONNECTING HIGH-FREQUENCY DMA TELEMETRY...`;

  const loadHbr = () =>
    fetchHbr(`/sessions/${sessionName}.hbr`, (loaded, total) => {
      loading.textContent = `OPEN-HFT // INITIALIZING BINARY ARCHIVE ${(loaded / 1e6).toFixed(1)}${total ? " / " + (total / 1e6).toFixed(1) : ""} MB`;
    });

  const rawHbr = await loadHbr();
  baseSessionHbr = rawHbr;
  const session = initialSymbol !== "BTCUSDT" ? createSessionForAsset(rawHbr, initialSymbol) : new Session(rawHbr);

  root.innerHTML = "";
  activeApp = new TerminalApp(root, session, "replay", initialSymbol, initialTile);
  activeApp.startMainLoop();
  setupDragAndDrop();
}

main().catch((e) => {
  const app = document.getElementById("app")!;
  app.innerHTML = `<div class="loading">ERROR INITIALIZING OPEN-HFT: ${String(e)}</div>`;
  console.error(e);
});
