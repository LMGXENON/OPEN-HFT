/**
 * Open-HRT Security Profile (DES)
 * Displays institutional fundamentals, valuation metrics, 52-week ranges,
 * trading telemetry, and execution SLA characteristics.
 */

import { el, esc } from "./dom";
import { fmtSmartPrice } from "./fmt";
import { getSecurity, type SecurityProfile } from "./assets_directory";

export class CompanyProfileModal {
  private overlay: HTMLElement;
  private contentBox: HTMLElement;
  private currentProfile: SecurityProfile | null = null;
  private onCloseCallback: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.overlay = el("div", "term-modal-overlay", parent);
    this.overlay.style.display = "none";

    this.contentBox = el("div", "term-modal-card", this.overlay);

    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.overlay.style.display !== "none") {
        this.close();
      }
    });
  }

  show(symbol: string, onClose?: () => void) {
    this.currentProfile = getSecurity(symbol);
    this.onCloseCallback = onClose || null;
    this.render();
    this.overlay.style.display = "flex";
  }

  close() {
    this.overlay.style.display = "none";
    if (this.onCloseCallback) {
      this.onCloseCallback();
    }
  }

  private render() {
    if (!this.currentProfile) return;
    const p = this.currentProfile;

    const pxStr = `$${fmtSmartPrice(p.basePrice)}`;
    const chg = p.change24h ?? 0;
    const chgCls = chg >= 0 ? "pos" : "neg";
    const chgSign = chg >= 0 ? "+" : "";

    this.contentBox.innerHTML = `
      <div class="modal-header">
        <div class="modal-title-left">
          <span class="m-badge ${p.assetClass.toLowerCase()}">${p.assetClass}</span>
          <span class="m-ticker">${esc(p.symbol)}</span>
          <span class="m-name">${esc(p.name)}</span>
          <span class="m-price">${pxStr}</span>
          <span class="m-chg ${chgCls}">${chgSign}${chg.toFixed(2)}%</span>
        </div>
        <button class="modal-close-btn">&times;</button>
      </div>

      <div class="modal-body-scroll">
        <!-- 1. IDENTIFIERS & SECTOR -->
        <div class="profile-section">
          <div class="sec-hdr">SECURITY IDENTIFIERS</div>
          <div class="profile-grid">
            <div class="field-item"><span class="lbl">TICKER</span><span class="val highlight">${esc(p.symbol)}</span></div>
            <div class="field-item"><span class="lbl">EXCHANGE</span><span class="val">${esc(p.exchange)}</span></div>
            <div class="field-item"><span class="lbl">SECTOR</span><span class="val">${esc(p.sector)}</span></div>
            <div class="field-item"><span class="lbl">ASSET CLASS</span><span class="val">${esc(p.assetClass)}</span></div>
            <div class="field-item"><span class="lbl">BASE CURRENCY</span><span class="val">${esc(p.currency)}</span></div>
            <div class="field-item"><span class="lbl">FEED PROTOCOL</span><span class="val">${p.isLive ? "Direct Exchange L2 Socket" : "Direct Exchange DMA"}</span></div>
          </div>
        </div>

        <!-- 2. FUNDAMENTAL VALUATION -->
        <div class="profile-section">
          <div class="sec-hdr">FUNDAMENTAL VALUATION</div>
          <div class="profile-grid">
            <div class="field-item"><span class="lbl">MARKET CAP / AUM</span><span class="val">${esc(p.marketCap)}</span></div>
            <div class="field-item"><span class="lbl">P/E RATIO</span><span class="val">${esc(p.peRatio)}</span></div>
            <div class="field-item"><span class="lbl">EV / EBITDA</span><span class="val">${esc(p.evEbitda)}</span></div>
            <div class="field-item"><span class="lbl">PRICE TO SALES</span><span class="val">${esc(p.priceToSales)}</span></div>
            <div class="field-item"><span class="lbl">EPS (TTM)</span><span class="val">${esc(p.eps)}</span></div>
            <div class="field-item"><span class="lbl">30D HIST VOL</span><span class="val">${esc(p.volatility30d)}</span></div>
          </div>
        </div>

        <!-- 3. LIQUIDITY & TRADING DYNAMICS -->
        <div class="profile-section">
          <div class="sec-hdr">TRADING & LIQUIDITY TELEMETRY</div>
          <div class="profile-grid">
            <div class="field-item"><span class="lbl">52-WEEK RANGE</span><span class="val">${esc(p.range52w)}</span></div>
            <div class="field-item"><span class="lbl">AVG DAILY VOLUME</span><span class="val">${esc(p.adv)}</span></div>
            <div class="field-item"><span class="lbl">TICK SIZE</span><span class="val">${p.tickSize}</span></div>
            <div class="field-item"><span class="lbl">MIN LOT SIZE</span><span class="val">${p.lotSize}</span></div>
            <div class="field-item"><span class="lbl">TARGET SPREAD</span><span class="val">${p.targetSpreadBps.toFixed(2)} bps</span></div>
            <div class="field-item"><span class="lbl">MARKOUT FORENSICS</span><span class="val">${p.targetMarkoutBps.toFixed(2)} bps</span></div>
          </div>
        </div>

        <!-- 4. EXECUTION BENCHMARK -->
        <div class="profile-section">
          <div class="sec-hdr">EXECUTION SLA & ROUTING FORENSICS</div>
          <div class="profile-grid">
            <div class="field-item"><span class="lbl">QUEUE SLA TARGET</span><span class="val">< ${p.queueSlaMs} ms</span></div>
            <div class="field-item"><span class="lbl">EXECUTION ENGINE</span><span class="val highlight">${esc(p.benchmarkEngine)}</span></div>
            <div class="field-item"><span class="lbl">ROUTING COMPLIANCE</span><span class="val">SEC 605/606 & MiFID II Best-Ex</span></div>
            <div class="field-item"><span class="lbl">ADVERSE SELECTION</span><span class="val">Markout Forensics @ +100ms / +1s / +5s / +30s</span></div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <span class="f-tip">Press ESC to dismiss</span>
        <button class="modal-close-action">CLOSE [ESC]</button>
      </div>
    `;

    this.contentBox.querySelector(".modal-close-btn")?.addEventListener("click", () => this.close());
    this.contentBox.querySelector(".modal-close-action")?.addEventListener("click", () => this.close());
  }
}
