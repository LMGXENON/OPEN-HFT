/**
 * Open-HRT Market Recorder & Ingestion Modal
 * High-density institutional control center to record real-time market data,
 * simulate HFT strategies, export .hbr archives, and manage the backtest library.
 */

import { el } from "./dom";
import { MarketRecorder, type RecorderConfig, type RecorderLiveMetrics } from "./market_recorder";
import {
  saveSessionToLibrary,
  listSessionsFromLibrary,
  getSessionBufferFromLibrary,
  deleteSessionFromLibrary,
  downloadSessionFile,
} from "./session_library";
import type { Hbr } from "./hbr";

export interface RecorderModalOptions {
  initialSymbol?: string;
  onLoadSession: (buf: ArrayBuffer, name: string) => void;
  onOpenTearSheet?: () => void;
}

export class RecorderModal {
  private container: HTMLElement;
  private overlay: HTMLElement;
  private recorder: MarketRecorder | null = null;
  private config: RecorderConfig;
  private options: RecorderModalOptions;

  // UI elements
  private statusBadge!: HTMLElement;
  private timerEl!: HTMLElement;
  private progressBar!: HTMLElement;
  private packetsEl!: HTMLElement;
  private l2El!: HTMLElement;
  private tradesEl!: HTMLElement;
  private fillsEl!: HTMLElement;
  private rateEl!: HTMLElement;
  private bufferEl!: HTMLElement;
  private bboEl!: HTMLElement;
  private startStopBtn!: HTMLButtonElement;
  private actionGroup!: HTMLElement;
  private libraryListEl!: HTMLElement;

  private latestBuffer: ArrayBuffer | null = null;
  private latestSessionName: string = "";

  constructor(options: RecorderModalOptions) {
    this.options = options;
    this.config = {
      symbol: (options.initialSymbol || "BTCUSDT").toUpperCase(),
      durationSec: 60,
      strategy: "queue_mm",
      latencyProfile: "colo_aws",
      orderQty: 0.002,
    };

    this.overlay = el("div", "term-modal-overlay", document.body);
    this.container = el("div", "term-modal recorder-modal", this.overlay);
    this.buildUI();
    this.overlay.style.display = "none";
  }

  public open(symbol?: string): void {
    if (symbol) {
      this.config.symbol = symbol.toUpperCase();
      const input = this.container.querySelector<HTMLInputElement>(".rec-sym-input");
      if (input) input.value = this.config.symbol;
      this.updateSymbolChips(this.config.symbol);
    }
    this.overlay.style.display = "flex";
    this.refreshLibrary();
  }

  public close(): void {
    if (this.recorder) {
      this.recorder.stop();
      this.recorder = null;
    }
    this.overlay.style.display = "none";
  }

  private buildUI(): void {
    // 1. Header
    const header = el("div", "modal-header", this.container);
    const titleBox = el("div", "modal-title-box", header);
    const recDot = el("span", "rec-beacon idle", titleBox);
    recDot.textContent = "●";
    const title = el("span", "modal-title", titleBox);
    title.textContent = "MARKET RECORDER & INGESTION ENGINE";
    const sub = el("span", "modal-sub", titleBox);
    sub.textContent = "OPEN-HRT // REAL-TIME L2 CAPTURE & MICROSECOND QUEUE SIMULATOR";

    const closeBtn = el("button", "modal-close-btn", header);
    closeBtn.textContent = "✕";
    closeBtn.onclick = () => this.close();

    // 2. Modal Body Grid
    const body = el("div", "modal-body rec-body", this.container);

    // Left Column: Parameters & Config
    const leftCol = el("div", "rec-col-config", body);

    // Asset selection
    const secLabel = el("div", "rec-field-label", leftCol);
    secLabel.textContent = "TARGET INSTRUMENT / MARKET";
    const chipsRow = el("div", "rec-chips-row", leftCol);
    const quickSymbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "DOGEUSDT", "PEPEUSDT", "NVDA", "SPY", "GOLD"];
    for (const s of quickSymbols) {
      const chip = el("button", `rec-chip ${s === this.config.symbol ? "active" : ""}`, chipsRow);
      chip.textContent = s.replace("USDT", "");
      chip.onclick = () => {
        this.config.symbol = s;
        symInput.value = s;
        this.updateSymbolChips(s);
      };
    }

    const inputRow = el("div", "rec-input-row", leftCol);
    const symInput = el("input", "rec-sym-input", inputRow) as HTMLInputElement;
    symInput.value = this.config.symbol;
    symInput.placeholder = "CUSTOM SYMBOL (e.g. BTCUSDT, AAPL)";
    symInput.onchange = () => {
      this.config.symbol = symInput.value.trim().toUpperCase() || "BTCUSDT";
      this.updateSymbolChips(this.config.symbol);
    };

    // Duration selection
    const durLabel = el("div", "rec-field-label", leftCol);
    durLabel.textContent = "RECORDING DURATION / RANGE";
    const durRow = el("div", "rec-chips-row", leftCol);
    const durations = [
      { label: "30s", val: 30 },
      { label: "1 MIN", val: 60 },
      { label: "3 MIN", val: 180 },
      { label: "5 MIN", val: 300 },
      { label: "MANUAL", val: 0 },
    ];
    for (const d of durations) {
      const chip = el("button", `rec-chip ${d.val === this.config.durationSec ? "active" : ""}`, durRow);
      chip.textContent = d.label;
      chip.onclick = () => {
        this.config.durationSec = d.val;
        durRow.querySelectorAll(".rec-chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
      };
    }

    // Strategy selection
    const stratLabel = el("div", "rec-field-label", leftCol);
    stratLabel.textContent = "IN-BROWSER EXECUTION SIMULATOR";
    const stratSelect = el("select", "rec-select", leftCol) as HTMLSelectElement;
    stratSelect.innerHTML = `
      <option value="queue_mm">Queue Market Maker (Power-law Model 3)</option>
      <option value="avellaneda">Avellaneda-Stoikov (Inventory Skew)</option>
      <option value="passive_grid">Passive Multi-Level Grid (Spread Capture)</option>
    `;
    stratSelect.value = this.config.strategy;
    stratSelect.onchange = () => {
      this.config.strategy = stratSelect.value as any;
    };

    // Latency Envelope
    const latLabel = el("div", "rec-field-label", leftCol);
    latLabel.textContent = "SIMULATED LATENCY ENVELOPE";
    const latSelect = el("select", "rec-select", leftCol) as HTMLSelectElement;
    latSelect.innerHTML = `
      <option value="colo_aws">AWS Tokyo Cloud Colo (~3.5ms RTT)</option>
      <option value="cross_connect">Direct Exchange Cross-Connect (~0.2ms RTT)</option>
      <option value="retail">Global Public Internet (~18.0ms RTT)</option>
    `;
    latSelect.value = this.config.latencyProfile;
    latSelect.onchange = () => {
      this.config.latencyProfile = latSelect.value as any;
    };

    // Right Column: Live Telemetry HUD & Status
    const rightCol = el("div", "rec-col-hud", body);

    const hudHeader = el("div", "rec-hud-header", rightCol);
    this.statusBadge = el("span", "rec-status-badge idle", hudHeader);
    this.statusBadge.textContent = "READY // STANDBY";
    this.timerEl = el("span", "rec-timer", hudHeader);
    this.timerEl.textContent = "00:00 / 01:00";

    const progressTrack = el("div", "rec-progress-track", rightCol);
    this.progressBar = el("div", "rec-progress-bar", progressTrack);

    // Live Metrics Grid
    const grid = el("div", "rec-stats-grid", rightCol);

    this.packetsEl = this.createStatBox(grid, "PACKETS RCVD", "0");
    this.l2El = this.createStatBox(grid, "L2 DELTAS", "0");
    this.tradesEl = this.createStatBox(grid, "AGG TRADES", "0");
    this.fillsEl = this.createStatBox(grid, "SIM FILLS", "0");
    this.rateEl = this.createStatBox(grid, "MSG RATE", "0 /s");
    this.bufferEl = this.createStatBox(grid, "BUFFER SIZE", "0 KB");

    // Live Price Banner
    const pBox = el("div", "rec-price-banner", rightCol);
    this.bboEl = el("div", "rec-bbo-text", pBox);
    this.bboEl.innerHTML = `<span class="dim">STANDBY:</span> WAITING FOR STREAM START`;

    // 3. Actions Row
    const footer = el("div", "modal-footer", this.container);

    this.startStopBtn = el("button", "modal-btn btn-primary start-rec-btn", footer) as HTMLButtonElement;
    this.startStopBtn.textContent = "● START RECORDING";
    this.startStopBtn.onclick = () => this.toggleRecording();

    this.actionGroup = el("div", "rec-post-actions", footer);
    this.actionGroup.style.display = "none";

    const replayBtn = el("button", "modal-btn btn-accent", this.actionGroup) as HTMLButtonElement;
    replayBtn.textContent = "▶ REPLAY IN TERMINAL";
    replayBtn.onclick = () => {
      if (this.latestBuffer) {
        this.options.onLoadSession(this.latestBuffer, this.latestSessionName);
        this.close();
      }
    };

    const exportBtn = el("button", "modal-btn btn-secondary", this.actionGroup) as HTMLButtonElement;
    exportBtn.textContent = "💾 EXPORT .HBR";
    exportBtn.onclick = () => {
      if (this.latestBuffer) {
        downloadSessionFile(this.latestBuffer, `${this.latestSessionName}.hbr`);
      }
    };

    if (this.options.onOpenTearSheet) {
      const tearSheetBtn = el("button", "modal-btn btn-tear", this.actionGroup) as HTMLButtonElement;
      tearSheetBtn.textContent = "📊 VIEW TCA TEAR SHEET";
      tearSheetBtn.onclick = () => {
        if (this.options.onOpenTearSheet) {
          this.options.onOpenTearSheet();
          this.close();
        }
      };
    }

    // 4. Recent Backtests Library
    const libSection = el("div", "rec-library-section", this.container);
    const libTitle = el("div", "rec-lib-title", libSection);
    libTitle.textContent = "SAVED BACKTEST ARCHIVES (BROWSER STORAGE)";
    this.libraryListEl = el("div", "rec-lib-list", libSection);
  }

  private createStatBox(parent: HTMLElement, label: string, initialVal: string): HTMLElement {
    const box = el("div", "rec-stat-card", parent);
    const l = el("div", "rec-stat-label", box);
    l.textContent = label;
    const v = el("div", "rec-stat-value", box);
    v.textContent = initialVal;
    return v;
  }

  private updateSymbolChips(activeSym: string): void {
    this.container.querySelectorAll(".rec-chips-row .rec-chip").forEach((chip) => {
      if (chip.textContent === activeSym.replace("USDT", "")) {
        chip.classList.add("active");
      } else {
        chip.classList.remove("active");
      }
    });
  }

  private isProcessingFinish = false;

  private async finishRecording(result: { hbr: Hbr; buffer: ArrayBuffer }): Promise<void> {
    if (this.isProcessingFinish) return;
    this.isProcessingFinish = true;
    try {
      this.latestBuffer = result.buffer;
      const dateStr = new Date().toISOString().slice(11, 19).replace(/:/g, "");
      const name = `${this.config.symbol.toLowerCase()}_rec_${dateStr}`;
      this.latestSessionName = name;

      const fills = result.hbr.arrays.get("e_kind")?.data.filter((k: number) => k === 3).length || 0;

      // Save to IndexedDB
      await saveSessionToLibrary({
        name: `${this.config.symbol} Live Capture (${this.config.durationSec ? this.config.durationSec + "s" : "Manual"})`,
        symbol: this.config.symbol,
        recordedAt: Date.now(),
        durationSec: result.hbr.meta.n_frames / 10,
        fillsCount: fills,
        eventCount: result.hbr.meta.run?.events_total || 0,
        totalPnl: 0,
        buffer: result.buffer,
      });

      this.startStopBtn.disabled = false;
      this.startStopBtn.textContent = "● NEW RECORDING";
      this.startStopBtn.classList.remove("recording");
      this.actionGroup.style.display = "flex";
      await this.refreshLibrary();
    } catch (e) {
      console.error("Error saving recording:", e);
    } finally {
      this.isProcessingFinish = false;
      this.recorder = null;
    }
  }

  private async toggleRecording(): Promise<void> {
    if (this.recorder) {
      // STOP recording
      this.startStopBtn.disabled = true;
      this.startStopBtn.textContent = "⏳ COMPILING .HBR...";
      const result = await this.recorder.stop();
      await this.finishRecording(result);
    } else {
      // START recording
      this.actionGroup.style.display = "none";
      this.latestBuffer = null;
      this.startStopBtn.textContent = "■ STOP & COMPILE";
      this.startStopBtn.classList.add("recording");

      this.recorder = new MarketRecorder(
        this.config,
        (m) => this.onMetrics(m),
        (result) => this.finishRecording(result)
      );
      await this.recorder.start();
    }
  }

  private onMetrics(m: RecorderLiveMetrics): void {
    const beacon = this.container.querySelector(".rec-beacon");
    if (m.status === "recording") {
      this.statusBadge.textContent = "● RECORDING LIVE DMA FEED";
      this.statusBadge.className = "rec-status-badge recording";
      if (beacon) beacon.className = "rec-beacon recording";
    } else if (m.status === "connecting") {
      this.statusBadge.textContent = "CONNECTING WEBSOCKET...";
      this.statusBadge.className = "rec-status-badge connecting";
    } else if (m.status === "compiling") {
      this.statusBadge.textContent = "COMPILING BINARY .HBR...";
      this.statusBadge.className = "rec-status-badge connecting";
    } else if (m.status === "done") {
      this.statusBadge.textContent = "✓ CAPTURE COMPLETE";
      this.statusBadge.className = "rec-status-badge done";
      if (beacon) beacon.className = "rec-beacon done";
      this.startStopBtn.textContent = "● NEW RECORDING";
      this.startStopBtn.classList.remove("recording");
    }

    const elapsed = m.elapsedSec;
    const dur = m.durationSec;
    const durText = dur > 0 ? this.fmtTime(dur) : "MANUAL";
    this.timerEl.textContent = `${this.fmtTime(elapsed)} / ${durText}`;

    const pct = dur > 0 ? Math.min(100, (elapsed / dur) * 100) : 100;
    this.progressBar.style.width = `${pct}%`;

    this.packetsEl.textContent = m.packetsReceived.toLocaleString();
    this.l2El.textContent = m.l2Updates.toLocaleString();
    this.tradesEl.textContent = m.tradesProcessed.toLocaleString();
    this.fillsEl.textContent = m.fillsCount.toLocaleString();
    this.rateEl.textContent = `${m.msgRate}/s`;
    this.bufferEl.textContent = `${(m.bufferSizeBytes / 1024).toFixed(1)} KB`;

    this.bboEl.innerHTML = `
      <span class="live-tag">LIVE:</span> 
      <span class="hl">${m.symbol}</span> 
      <span class="px">${m.lastTradePrice.toFixed(2)}</span> 
      <span class="spread">BID: ${m.bestBid.toFixed(2)} | ASK: ${m.bestAsk.toFixed(2)} (${m.currentSpreadBps.toFixed(1)} bps)</span>
    `;
  }

  private fmtTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  private async refreshLibrary(): Promise<void> {
    try {
      const list = await listSessionsFromLibrary();
      this.libraryListEl.innerHTML = "";
      if (list.length === 0) {
        this.libraryListEl.innerHTML = `<div class="rec-lib-empty">No local backtests recorded yet. Click "Start Recording" above or drop a .hbr file.</div>`;
        return;
      }

      for (const item of list) {
        const row = el("div", "rec-lib-row", this.libraryListEl);
        const dateStr = new Date(item.recordedAt).toLocaleString();
        row.innerHTML = `
          <div class="lib-info">
            <span class="lib-sym">${item.symbol}</span>
            <span class="lib-name">${item.name}</span>
            <span class="lib-date">${dateStr}</span>
          </div>
          <div class="lib-metrics">
            <span class="lib-dur">${item.durationSec.toFixed(1)}s</span>
            <span class="lib-fills">${item.fillsCount} fills</span>
            <span class="lib-size">${(item.sizeBytes / 1024).toFixed(1)} KB</span>
          </div>
        `;

        const actions = el("div", "lib-actions", row);
        const loadBtn = el("button", "lib-btn load", actions);
        loadBtn.textContent = "LOAD";
        loadBtn.onclick = async () => {
          const buf = await getSessionBufferFromLibrary(item.id);
          if (buf) {
            this.options.onLoadSession(buf, item.name);
            this.close();
          }
        };

        const dlBtn = el("button", "lib-btn dl", actions);
        dlBtn.textContent = "EXPORT";
        dlBtn.onclick = async () => {
          const buf = await getSessionBufferFromLibrary(item.id);
          if (buf) {
            downloadSessionFile(buf, `${item.name.replace(/\s+/g, "_")}.hbr`);
          }
        };

        const delBtn = el("button", "lib-btn del", actions);
        delBtn.textContent = "✕";
        delBtn.onclick = async (e) => {
          e.stopPropagation();
          if (confirm(`Delete backtest "${item.name}" from local storage?`)) {
            await deleteSessionFromLibrary(item.id);
            this.refreshLibrary();
          }
        };
      }
    } catch (e) {
      console.error("Failed to load library:", e);
    }
  }
}
