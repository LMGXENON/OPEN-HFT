/**
 * Stratum Institutional Terminal Navigation Bar
 * Features:
 * - Clean institutional header with mode switch (LIVE vs REPLAY)
 * - Universal Asset & Company Search (800+ crypto pairs, memecoins, stocks, commodities, ETFs, FX)
 * - Numbered Tile Navigation Row (0 ALL, 1 BOOK, 2 QUEUE, 3 LATENCY, 4 EXECUTIONS, 5 MARKET, 6 TRADES, 7 LOG, 8 ENGINE, 9 COLLECTOR)
 * - Interactive Replay Controls (Play/Pause, Step, Time Scrubber, Speed 0.5x - 20x)
 * - Real-time Market Quote Strip
 */

import { el, esc } from "./dom";
import { elapsed, fmtSmartPrice } from "./fmt";
import type { LiveMarketState } from "./live_feed";
import { searchAssets, getSecurity } from "./assets_directory";

export type Mode = "live" | "replay";

export interface NavBarCallbacks {
  onSymbolChange: (symbol: string) => void;
  onModeToggle: (mode: Mode) => void;
  onTileSelect: (tileNum: number) => void;
  onOpenProfile: (symbol: string) => void;
  onExportReport: () => void;
  onLoadSessionFile?: (buf: ArrayBuffer, fileName: string) => void;
  onReplayToggle?: () => void;
  onReplayStep?: (deltaSec: number) => void;
  onReplayJumpToStart?: () => void;
  onReplayJumpToEnd?: () => void;
  onReplaySeekPct?: (pct: number) => void;
  onReplaySpeed?: (speed: number) => void;
}

export class NavBar {
  readonly root: HTMLElement;
  private currentMode: Mode = "live";
  private activeTile: number = 0; // 0 = ALL
  private currentSymbol: string = "BTCUSDT";
  private callbacks: NavBarCallbacks;

  private commandInput!: HTMLInputElement;
  private searchDropdown!: HTMLElement;
  private quoteStrip!: HTMLElement;
  private replayBar!: HTMLElement;
  private replayPlayBtn!: HTMLElement;
  private prevPrice = 0;
  private replaySlider!: HTMLInputElement;
  private replayTimeLabel!: HTMLElement;
  private replaySpeedButtons: Map<number, HTMLElement> = new Map();
  private tileButtons: Map<number, HTMLElement> = new Map();

  constructor(parent: HTMLElement, callbacks: NavBarCallbacks, _initialMode: Mode = "replay", initialSymbol = "BTCUSDT") {
    this.callbacks = callbacks;
    this.currentMode = "replay";
    this.currentSymbol = initialSymbol;

    this.root = el("header", "term-nav-root", parent);
    this.render();
  }

  private render() {
    this.root.innerHTML = "";

    // =========================================================================
    // ROW 1: BRAND, UNIVERSAL SEARCH, QUICK PILLS, PROFILE & MODE TOGGLE
    // ROW 1: BRAND, UNIVERSAL SEARCH, QUICK PILLS, PROFILE & MODE BADGE
    // =========================================================================
    const topRow = el("div", "term-nav-row top-row", this.root);

    // Left Brand
    const brand = el("div", "term-brand", topRow);
    brand.innerHTML = `
      <span class="brand-title">OPEN-HFT</span>
      <span class="brand-tag">BACKTEST</span>
    `;

    // Dedicated Backtest Badge (no toggle button)
    const modeBadge = el("div", "term-mode-badge", topRow);
    modeBadge.innerHTML = `<span class="mode-dot replay"></span><span class="mode-label">BACKTEST</span>`;
    modeBadge.title = "OPEN-HFT Quantitative Microstructure Replay & Backtest Engine";

    // Center Universal Search Command Box
    const searchContainer = el("div", "term-search-container", topRow);
    const searchPrefix = el("span", "term-search-prefix", searchContainer);
    searchPrefix.textContent = "SEC>";

    this.commandInput = el("input", "term-search-input", searchContainer);
    this.commandInput.type = "text";
    this.commandInput.value = this.currentSymbol;
    this.commandInput.placeholder = "Search 800+ assets & companies (PEPE, DOGE, NVDA, AAPL, GOLD, SPY)...";

    const goBtn = el("button", "term-go-btn", searchContainer);
    goBtn.textContent = "GO";
    goBtn.onclick = () => this.handleCommandSubmit();

    // Autocomplete Dropdown
    this.searchDropdown = el("div", "term-search-dropdown", searchContainer);
    this.searchDropdown.style.display = "none";

    this.commandInput.addEventListener("input", () => this.handleSearchInput());
    this.commandInput.addEventListener("focus", () => {
      if (this.commandInput.value.trim().length > 0) this.handleSearchInput();
    });

    document.addEventListener("click", (e) => {
      if (!searchContainer.contains(e.target as Node)) {
        this.searchDropdown.style.display = "none";
      }
    });

    this.commandInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.handleCommandSubmit();
        this.searchDropdown.style.display = "none";
      } else if (e.key === "Escape") {
        this.searchDropdown.style.display = "none";
      }
    });

    // Quick Ticker Chips across All Asset Classes & Memecoins
    const chipsContainer = el("div", "term-quick-chips", topRow);
    const popularSecurities = [
      { sym: "BTCUSDT", label: "BTC" },
      { sym: "ETHUSDT", label: "ETH" },
      { sym: "SOLUSDT", label: "SOL" },
      { sym: "DOGEUSDT", label: "DOGE" },
      { sym: "1000PEPEUSDT", label: "PEPE" },
      { sym: "WIFUSDT", label: "WIF" },
      { sym: "NVDA", label: "NVDA" },
      { sym: "AAPL", label: "AAPL" },
      { sym: "SPY", label: "SPY" },
      { sym: "XAUUSD", label: "GOLD" },
    ];

    for (const item of popularSecurities) {
      const chip = el("button", "term-chip", chipsContainer);
      chip.textContent = item.label;
      if (item.sym === this.currentSymbol) chip.classList.add("active");
      chip.onclick = () => {
        this.setSymbol(item.sym);
        chipsContainer.querySelectorAll(".term-chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
      };
    }

    // Right Action Buttons
    const rightActions = el("div", "term-right-actions", topRow);

    const fileInput = el("input", "term-file-input", rightActions) as HTMLInputElement;
    fileInput.type = "file";
    fileInput.accept = ".hbr";
    fileInput.style.display = "none";
    fileInput.onchange = () => {
      const file = fileInput.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => {
          if (reader.result instanceof ArrayBuffer) {
            this.callbacks.onLoadSessionFile?.(reader.result, file.name);
          }
        };
        reader.readAsArrayBuffer(file);
      }
      fileInput.value = "";
    };

    const loadBtn = el("button", "term-action-btn load-btn", rightActions);
    loadBtn.innerHTML = `<span class="k-hint">⊕</span> LOAD .HBR`;
    loadBtn.title = "Load custom .hbr backtest recording from disk";
    loadBtn.onclick = () => fileInput.click();

    const profileBtn = el("button", "term-action-btn", rightActions);
    profileBtn.innerHTML = `<span class="k-hint">DES</span> PROFILE`;
    profileBtn.title = "Open Security Description Profile (F8 / D)";
    profileBtn.onclick = () => this.callbacks.onOpenProfile(this.currentSymbol);

    const exportBtn = el("button", "term-action-btn export", rightActions);
    exportBtn.innerHTML = `<span class="k-hint">F7</span> EXPORT`;
    exportBtn.title = "Export TCA Audit Report";
    exportBtn.onclick = () => this.callbacks.onExportReport();

    // =========================================================================
    // ROW 2: NUMBERED TILES NAVIGATION (0 to 9)
    // =========================================================================
    const tilesNavRow = el("div", "term-nav-row tiles-nav-row", this.root);

    const tilesDef: Array<{ num: number; label: string }> = [
      { num: 0, label: "ALL TILES" },
      { num: 1, label: "BOOK" },
      { num: 2, label: "QUEUE" },
      { num: 3, label: "LATENCY" },
      { num: 4, label: "EXECUTIONS" },
      { num: 5, label: "MARKET" },
      { num: 6, label: "TRADES" },
      { num: 7, label: "LOG" },
      { num: 8, label: "ENGINE" },
      { num: 9, label: "COLLECTOR" },
    ];

    this.tileButtons.clear();
    for (const t of tilesDef) {
      const btn = el("button", "term-tile-btn", tilesNavRow);
      if (t.num === this.activeTile) btn.classList.add("active");
      btn.innerHTML = `<span class="tile-num">${t.num}</span> <span class="tile-name">${t.label}</span>`;
      btn.onclick = () => {
        const target = (this.activeTile === t.num && t.num !== 0) ? 0 : t.num;
        this.setActiveTile(target);
        this.callbacks.onTileSelect(target);
      };
      this.tileButtons.set(t.num, btn);
    }

    // =========================================================================
    // ROW 2B: INTERACTIVE REPLAY & BACKTEST CONTROLS (Active in Replay Mode)
    // =========================================================================
    this.replayBar = el("div", "term-nav-row replay-control-bar", this.root);
    this.replayBar.style.display = this.currentMode === "replay" ? "flex" : "none";

    const rControls = el("div", "r-controls-left", this.replayBar);

    const jumpStartBtn = el("button", "r-btn jump-btn", rControls);
    jumpStartBtn.innerHTML = `⏮`;
    jumpStartBtn.title = "Jump to beginning of recording (Home)";
    jumpStartBtn.onclick = () => this.callbacks.onReplayJumpToStart?.();

    const stepBack5Btn = el("button", "r-btn step-btn", rControls);
    stepBack5Btn.innerHTML = `◄ -5s`;
    stepBack5Btn.title = "Step back 5 seconds (Shift+Left)";
    stepBack5Btn.onclick = () => this.callbacks.onReplayStep?.(-5);

    const stepBack100Btn = el("button", "r-btn step-btn micro-step", rControls);
    stepBack100Btn.innerHTML = `-100ms`;
    stepBack100Btn.title = "Step back 100ms (Left arrow)";
    stepBack100Btn.onclick = () => this.callbacks.onReplayStep?.(-0.1);

    this.replayPlayBtn = el("button", "r-btn play-btn", rControls);
    this.replayPlayBtn.innerHTML = `► PLAY`;
    this.replayPlayBtn.title = "Play / Pause (Space)";
    this.replayPlayBtn.onclick = () => this.callbacks.onReplayToggle?.();

    const stepFwd100Btn = el("button", "r-btn step-btn micro-step", rControls);
    stepFwd100Btn.innerHTML = `+100ms`;
    stepFwd100Btn.title = "Step forward 100ms (Right arrow)";
    stepFwd100Btn.onclick = () => this.callbacks.onReplayStep?.(0.1);

    const stepFwd5Btn = el("button", "r-btn step-btn", rControls);
    stepFwd5Btn.innerHTML = `+5s ►`;
    stepFwd5Btn.title = "Step forward 5 seconds (Shift+Right)";
    stepFwd5Btn.onclick = () => this.callbacks.onReplayStep?.(5);

    const jumpEndBtn = el("button", "r-btn jump-btn", rControls);
    jumpEndBtn.innerHTML = `⏭`;
    jumpEndBtn.title = "Jump to end of recording (End)";
    jumpEndBtn.onclick = () => this.callbacks.onReplayJumpToEnd?.();

    const sliderContainer = el("div", "r-slider-container", this.replayBar);
    this.replaySlider = el("input", "r-scrubber", sliderContainer) as HTMLInputElement;
    this.replaySlider.type = "range";
    this.replaySlider.min = "0";
    this.replaySlider.max = "10000";
    this.replaySlider.value = "0";
    this.replaySlider.oninput = () => {
      const pct = parseFloat(this.replaySlider.value) / 10000;
      this.callbacks.onReplaySeekPct?.(pct);
    };

    this.replayTimeLabel = el("span", "r-time-label", sliderContainer);
    this.replayTimeLabel.textContent = "0:00.0 / 0:00.0";

    const speeds = [0.25, 0.5, 1, 2, 5, 10, 25, 50];
    const speedContainer = el("div", "r-speed-container", this.replayBar);
    for (const spd of speeds) {
      const sBtn = el("button", "r-speed-btn", speedContainer);
      sBtn.textContent = spd === 50 ? "MAX" : `${spd}x`;
      if (spd === 1) sBtn.classList.add("active");
      sBtn.onclick = () => {
        this.callbacks.onReplaySpeed?.(spd);
        this.replaySpeedButtons.forEach((b) => b.classList.remove("active"));
        sBtn.classList.add("active");
      };
      this.replaySpeedButtons.set(spd, sBtn);
    }

    // =========================================================================
    // ROW 3: REAL-TIME MARKET QUOTE STRIP
    // =========================================================================
    this.quoteStrip = el("div", "term-nav-row quote-strip-row", this.root);
    this.renderDefaultQuoteStrip();
  }

  updateReplayState(playing: boolean, currentNs: number, totalNs: number, speed: number) {
    if (this.currentMode !== "replay") return;
    this.replayPlayBtn.innerHTML = playing ? `❚❚ PAUSE` : `► PLAY`;
    if (playing) {
      this.replayPlayBtn.classList.add("playing");
    } else {
      this.replayPlayBtn.classList.remove("playing");
    }

    if (totalNs > 0) {
      const pct = Math.min(10000, Math.max(0, Math.floor((currentNs / totalNs) * 10000)));
      this.replaySlider.value = String(pct);
      const curStr = elapsed(currentNs);
      const totStr = elapsed(totalNs);
      const pctStr = ((currentNs / totalNs) * 100).toFixed(1);
      this.replayTimeLabel.textContent = `${curStr} / ${totStr} (${pctStr}%)`;
    }

    this.replaySpeedButtons.forEach((btn, spd) => {
      if (Math.abs(spd - speed) < 0.1) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  private handleSearchInput() {
    const raw = this.commandInput.value.trim().toUpperCase().replace("<GO>", "").trim();
    if (raw.length === 0) {
      this.searchDropdown.style.display = "none";
      return;
    }

    const matches = searchAssets(raw, 12);
    if (matches.length === 0) {
      this.searchDropdown.innerHTML = `<div class="search-empty">Press GO to load DMA for "${esc(raw)}"</div>`;
      this.searchDropdown.style.display = "block";
      return;
    }

    this.searchDropdown.innerHTML = matches
      .map((sec) => {
        const pxStr = sec.basePrice >= 1 ? `$${sec.basePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${sec.basePrice.toFixed(6)}`;
        const chg = sec.change24h ?? 0;
        const chgCls = chg >= 0 ? "pos" : "neg";
        const chgSign = chg >= 0 ? "+" : "";
        const badgeCls = sec.assetClass.toLowerCase();

        return `
        <div class="search-row" data-sym="${esc(sec.symbol)}">
          <span class="s-badge ${badgeCls}">${sec.assetClass}</span>
          <span class="s-sym">${esc(sec.symbol)}</span>
          <span class="s-name" title="${esc(sec.name)}">${esc(sec.name)}</span>
          <span class="s-px">${pxStr}</span>
          <span class="s-chg ${chgCls}">${chgSign}${chg.toFixed(2)}%</span>
          <span class="s-sector" title="${esc(sec.sector)}">${esc(sec.sector)}</span>
        </div>
      `;
      })
      .join("");

    this.searchDropdown.querySelectorAll(".search-row").forEach((row) => {
      row.addEventListener("click", () => {
        const sym = (row as HTMLElement).dataset.sym;
        if (sym) {
          this.setSymbol(sym);
          this.searchDropdown.style.display = "none";
        }
      });
    });

    this.searchDropdown.style.display = "block";
  }

  private handleCommandSubmit() {
    const raw = this.commandInput.value.trim().toUpperCase().replace("<GO>", "").trim();
    if (raw) {
      this.setSymbol(raw);
      this.searchDropdown.style.display = "none";
    }
  }

  setSymbol(symbol: string) {
    this.currentSymbol = symbol.toUpperCase().trim();
    this.commandInput.value = this.currentSymbol;
    this.callbacks.onSymbolChange(this.currentSymbol);
  }

  setMode(_mode: Mode) {
    this.currentMode = "replay";
    if (this.replayBar) {
      this.replayBar.style.display = "flex";
    }
  }

  setActiveTile(num: number) {
    this.activeTile = num;
    this.tileButtons.forEach((btn, tNum) => {
      if (tNum === num) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  getActiveTile(): number {
    return this.activeTile;
  }

  private renderDefaultQuoteStrip() {
    const sec = getSecurity(this.currentSymbol);
    this.updateQuoteStrip({
      symbol: sec.symbol,
      lastPrice: sec.basePrice,
      priceChangePct24h: sec.change24h ?? 0,
      high24h: sec.high24h ?? sec.basePrice * 1.02,
      low24h: sec.low24h ?? sec.basePrice * 0.98,
      volume24h: sec.volume24h ?? 1500000000,
      vwap24h: sec.basePrice,
      spreadBps: sec.targetSpreadBps,
      midPrice: sec.basePrice,
      bids: [{ price: sec.basePrice - sec.tickSize, qty: 10 }],
      asks: [{ price: sec.basePrice + sec.tickSize, qty: 10 }],
    });
  }

  updateQuoteStrip(state: Partial<LiveMarketState>) {
    const px = state.lastPrice ?? 100;
    const pxStr = `$${fmtSmartPrice(px)}`;

    let tickClass = "";
    if (this.prevPrice > 0) {
      if (px > this.prevPrice) tickClass = "tick-up";
      else if (px < this.prevPrice) tickClass = "tick-down";
    }
    this.prevPrice = px;

    const chg = state.priceChangePct24h ?? 0;
    const chgCls = chg >= 0 ? "pos" : "neg";
    const chgSign = chg >= 0 ? "+" : "";

    const spreadBps = state.spreadBps ?? 0.25;
    const hi = state.high24h ?? px * 1.02;
    const lo = state.low24h ?? px * 0.98;
    const vol = state.volume24h ?? 0;
    const volStr = vol >= 1e9 ? `$${(vol / 1e9).toFixed(2)}B` : vol >= 1e6 ? `$${(vol / 1e6).toFixed(1)}M` : `$${vol.toLocaleString()}`;

    const sec = getSecurity(this.currentSymbol);

    this.quoteStrip.innerHTML = `
      <div class="q-sec-info">
        <span class="q-badge ${sec.assetClass.toLowerCase()}">${sec.assetClass}</span>
        <span class="q-sym">${esc(this.currentSymbol)}</span>
        <span class="q-name">${esc(sec.name)}</span>
        <span class="q-px ${tickClass}">${pxStr}</span>
        <span class="q-chg ${chgCls}">${chgSign}${chg.toFixed(2)}%</span>
      </div>
      <div class="q-metrics">
        <div class="q-item"><span class="lbl">SPREAD</span> <span class="val">${spreadBps.toFixed(2)} bps</span></div>
        <div class="q-item"><span class="lbl">24H HIGH</span> <span class="val">$${fmtSmartPrice(hi)}</span></div>
        <div class="q-item"><span class="lbl">24H LOW</span> <span class="val">$${fmtSmartPrice(lo)}</span></div>
        <div class="q-item"><span class="lbl">24H VOL</span> <span class="val">${volStr}</span></div>
        <div class="q-item"><span class="lbl">VWAP</span> <span class="val">$${fmtSmartPrice(state.vwap24h ?? px)}</span></div>
        <div class="q-item"><span class="lbl">VENUE</span> <span class="val dim">${esc(sec.exchange)}</span></div>
      </div>
    `;
  }
}
