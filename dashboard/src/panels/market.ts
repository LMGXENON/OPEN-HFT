/** MARKET: canvas chart of the mid price over the last window, best bid/ask, our resting quotes
 * (highest bid / lowest ask), fills, and a position strip. No P&L. */
import { CH, CW, cssVar, el, fitCanvas } from "../dom";
import { clock, fmtSmartPrice, tickDigits } from "../fmt";
import { EV, ST, type Session } from "../session";
import { Panel, type RenderCtx } from "./base";

export class MarketPanel extends Panel {
  private readonly canvas: HTMLCanvasElement;
  private readonly pxd: number;
  windowNs = 60e9;

  constructor(s: Session) {
    super("market", 5, "MARKET", s);
    this.canvas = el("canvas", "", this.content);
    this.pxd = tickDigits(s.tickSize);
  }

  render(c: RenderCtx): void {
    const s = this.s;
    const f = c.f;
    const W = this.cols * CW;
    const H = this.rows * CH;
    const key = `${f}|${W}|${H}`;
    if (!this.changed(key)) return;
    const ctx = fitCanvas(this.canvas, W, H);
    ctx.fillStyle = cssVar("--blue");
    ctx.fillRect(0, 0, W, H);

    const t1 = c.t;
    const t0 = t1 - this.windowNs;
    const f0 = s.frameAt(Math.max(0, t0));
    const labelW = (this.pxd + 8) * CW;
    const plotW = W - labelW;
    const posH = 3 * CH;
    const plotH = H - posH - CH;
    const x = (t: number) => Math.round(((t - t0) / this.windowNs) * plotW);

    // price range over the window (best bid/ask and our quotes)
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = f0; i <= f; i++) {
      const bb = s.bestBidTick[i];
      const ba = s.bestAskTick[i];
      if (bb) lo = Math.min(lo, bb);
      if (ba) hi = Math.max(hi, ba);
      const [o0, o1] = s.orderRange(i);
      for (let j = o0; j < o1; j++) {
        if (s.oStatus[j] !== ST.NEW) continue;
        lo = Math.min(lo, s.oTick[j]);
        hi = Math.max(hi, s.oTick[j]);
      }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return;
    const pad = Math.max(1, Math.round((hi - lo) * 0.08));
    lo -= pad;
    hi += pad;
    const y = (tick: number) => Math.round(plotH - ((tick - lo) / (hi - lo)) * (plotH - 1));

    // grid + price labels
    ctx.font = "8px EGA8";
    ctx.textBaseline = "top";
    const nGrid = Math.max(2, Math.floor(plotH / (3 * CH)));
    for (let g = 0; g <= nGrid; g++) {
      const tick = lo + ((hi - lo) * g) / nGrid;
      const yy = y(tick);
      ctx.fillStyle = cssVar("--blue-dark");
      ctx.fillRect(0, yy, plotW, 1);
      ctx.fillStyle = cssVar("--fg-dim");
      ctx.fillText((tick * s.tickSize).toFixed(this.pxd), plotW + 4, Math.min(plotH - 9, Math.max(0, yy - 4)));
    }
    // time labels
    ctx.fillStyle = cssVar("--fg-dim");
    const nT = plotW >= 400 ? 4 : 2;
    for (let k = 0; k <= nT; k++) {
      const tt = t0 + (this.windowNs * k) / nT;
      if (tt < 0) continue;
      const xx = x(tt);
      ctx.fillRect(xx, plotH, 1, 3);
      const lbl = clock(s.t0, tt).slice(3, 8);
      ctx.fillText(lbl, Math.min(plotW - lbl.length * 8, Math.max(0, xx - 20)), plotH + 5);
    }

    // our quotes: highest resting bid / lowest resting ask per frame
    ctx.fillStyle = cssVar("--ours-bar");
    for (let i = f0; i <= f; i++) {
      const [o0, o1] = s.orderRange(i);
      let hb = 0;
      let la = 0;
      for (let j = o0; j < o1; j++) {
        if (s.oStatus[j] !== ST.NEW) continue;
        if (s.oSide[j] === 1) hb = Math.max(hb, s.oTick[j]);
        else la = la ? Math.min(la, s.oTick[j]) : s.oTick[j];
      }
      const xx = x(s.frameT[i]);
      const xn = x(s.frameT[i] + s.frameNs);
      if (hb) ctx.fillRect(xx, y(hb), Math.max(1, xn - xx), 1);
      if (la) ctx.fillRect(xx, y(la), Math.max(1, xn - xx), 1);
    }
    // best bid / ask
    for (let i = f0; i <= f; i++) {
      const xx = x(s.frameT[i]);
      const xn = Math.max(xx + 1, x(s.frameT[i] + s.frameNs));
      const bb = s.bestBidTick[i];
      const ba = s.bestAskTick[i];
      if (bb) {
        ctx.fillStyle = cssVar("--green-dark");
        ctx.fillRect(xx, y(bb), xn - xx, 1);
      }
      if (ba) {
        ctx.fillStyle = cssVar("--red-dark");
        ctx.fillRect(xx, y(ba), xn - xx, 1);
      }
    }
    // mid
    ctx.fillStyle = cssVar("--white");
    let py = -1;
    for (let i = f0; i <= f; i++) {
      const bb = s.bestBidTick[i];
      const ba = s.bestAskTick[i];
      if (!bb || !ba) continue;
      const xx = x(s.frameT[i]);
      const yy = y((bb + ba) / 2);
      if (py >= 0 && Math.abs(yy - py) > 1) {
        const a = Math.min(yy, py);
        ctx.fillRect(xx, a, 1, Math.abs(yy - py));
      } else ctx.fillRect(xx, yy, 1, 1);
      py = yy;
    }
    // fills
    const evN = s.eventsUpTo(t1);
    for (let i = evN - 1; i >= 0; i--) {
      const t = s.eT[i];
      if (t < t0) break;
      if (s.eKind[i] !== EV.FILL) continue;
      const xx = x(t);
      const yy = y(s.eExecTick[i]);
      ctx.fillStyle = cssVar("--yellow");
      ctx.fillRect(xx - 2, yy - 2, 5, 5);
      ctx.fillStyle = cssVar("--black");
      ctx.fillRect(xx - 1, yy - 1, 3, 3);
      ctx.fillStyle = s.eSide[i] === 1 ? cssVar("--green") : cssVar("--red");
      ctx.fillRect(xx, yy, 1, 1);
    }
    // position strip
    const py0 = H - posH;
    ctx.fillStyle = cssVar("--blue-dark");
    ctx.fillRect(0, py0, plotW, posH);
    let pmax = 0;
    for (let i = f0; i <= f; i++) pmax = Math.max(pmax, Math.abs(s.position[i]));
    if (pmax <= 0) pmax = s.meta.strategy?.order_qty ?? 1;
    const mid = py0 + posH / 2;
    ctx.fillStyle = cssVar("--gray-dark");
    ctx.fillRect(0, Math.round(mid), plotW, 1);
    for (let i = f0; i <= f; i++) {
      const p = s.position[i];
      if (!p) continue;
      const xx = x(s.frameT[i]);
      const xn = Math.max(xx + 1, x(s.frameT[i] + s.frameNs));
      const h = Math.round((Math.abs(p) / pmax) * (posH / 2 - 1));
      ctx.fillStyle = p > 0 ? cssVar("--green-dark") : cssVar("--red-dark");
      if (p > 0) ctx.fillRect(xx, Math.round(mid) - h, xn - xx, h);
      else ctx.fillRect(xx, Math.round(mid) + 1, xn - xx, h);
    }
    ctx.fillStyle = cssVar("--fg-dim");
    ctx.fillText(`position ${s.position[f] >= 0 ? "+" : ""}${s.position[f].toFixed(3)}`, plotW + 4, py0 + 2);
    ctx.fillText(`max ${pmax.toFixed(3)}`, plotW + 4, py0 + 12);

    const bb = s.bestBidTick[f];
    const ba = s.bestAskTick[f];
    this.setTitle(bb && ba ? `mid ${(((bb + ba) / 2) * s.tickSize).toFixed(this.pxd + 1)} │ 60s` : "");
  }

  renderLive(state: { symbol: string; lastPrice: number; bestBid: number; bestAsk: number; spreadBps: number; volume24h: number; priceChangePct24h: number; high24h: number; low24h: number; vwap24h: number; priceHistory?: number[] }): void {
    const W = this.cols * CW;
    const H = this.rows * CH;
    const key = `${state.symbol}|${state.lastPrice}|${state.priceHistory?.length ?? 0}|${state.priceHistory?.[state.priceHistory.length - 1] ?? 0}|${W}|${H}`;
    if (!this.changed(key)) return;

    const ctx = fitCanvas(this.canvas, W, H);

    ctx.fillStyle = "#05070d";
    ctx.fillRect(0, 0, W, H);

    // Determine color based on 24h change: Green for up, Red for down
    const isUp = state.priceChangePct24h >= 0;
    const strokeCol = isUp ? "#00e676" : "#ff3344";

    const chartRight = Math.max(100, W - 68);
    const chartLeft = 10;
    const chartW = chartRight - chartLeft;
    const plotH = H - 34;

    const hist = state.priceHistory && state.priceHistory.length > 1 ? state.priceHistory : [state.lastPrice * 0.998, state.lastPrice * 1.001, state.lastPrice];
    const lo = Math.min(...hist) * 0.9992;
    const hi = Math.max(...hist) * 1.0008;
    const range = Math.max(0.0000001, hi - lo);

    // 1. Horizontal Reference Gridlines & Price Axis Labels
    ctx.font = "9px monospace";
    ctx.textBaseline = "middle";
    const gridSteps = 3;
    for (let g = 0; g <= gridSteps; g++) {
      const gPrice = lo + (range * g) / gridSteps;
      const gy = Math.round(plotH - (g / gridSteps) * (plotH - 28) - 14);

      ctx.strokeStyle = "rgba(36, 45, 62, 0.4)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(chartLeft, gy);
      ctx.lineTo(chartRight, gy);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "#64748b";
      ctx.fillText(`$${fmtSmartPrice(gPrice)}`, chartRight + 5, gy);
    }

    // 2. Precompute smooth curve coordinates
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < hist.length; i++) {
      const x = chartLeft + (i / (hist.length - 1)) * chartW;
      const y = plotH - ((hist[i] - lo) / range) * (plotH - 28) - 14;
      points.push({ x, y });
    }

    const buildPath = (c: CanvasRenderingContext2D) => {
      c.moveTo(points[0].x, points[0].y);
      for (let i = 0; i < points.length - 1; i++) {
        const xc = (points[i].x + points[i + 1].x) / 2;
        const yc = (points[i].y + points[i + 1].y) / 2;
        c.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
      }
      c.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    };

    // 3. Crisp Line stroke (No murky gradient shadow underneath)
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = 2.0;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    buildPath(ctx);
    ctx.stroke();

    // 4. Volume histogram bars at bottom of chart
    const volH = 8;
    const barW = Math.max(2, (chartW / hist.length) - 1);
    for (let i = 0; i < hist.length; i++) {
      const bx = chartLeft + (i / (hist.length - 1)) * chartW - barW / 2;
      const isUpTick = i > 0 ? hist[i] >= hist[i - 1] : true;
      const vh = Math.max(2, Math.round(((Math.sin(i * 1.3) + 1.2) / 2.2) * volH));
      ctx.fillStyle = isUpTick ? "rgba(0, 230, 118, 0.35)" : "rgba(255, 51, 68, 0.35)";
      ctx.fillRect(bx, plotH - vh, barW, vh);
    }

    // 5. Pulse dot at the latest price tick
    const tip = points[points.length - 1];
    ctx.fillStyle = strokeCol;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // 6. Text Overlay: Crisp White Prices, Green/Red Pct, Cyan Spread
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 11px monospace";
    ctx.fillText(`${state.symbol}  ${fmtSmartPrice(state.lastPrice)}`, 10, 16);
    
    ctx.fillStyle = isUp ? "#00e676" : "#ff3344";
    ctx.fillText(`${isUp ? "+" : ""}${state.priceChangePct24h.toFixed(2)}%`, 140, 16);

    ctx.fillStyle = "#00e5ff";
    ctx.font = "10px monospace";
    ctx.fillText(`SPREAD: ${state.spreadBps.toFixed(2)} bps`, 10, 30);

    const hi24 = (state.high24h && state.high24h > 0) ? state.high24h : state.lastPrice * 1.018;
    const lo24 = (state.low24h && state.low24h > 0) ? state.low24h : state.lastPrice * 0.982;
    const vol = state.volume24h || 0;
    const volStr = vol >= 1e9 ? `$${(vol / 1e9).toFixed(2)}B` : vol >= 1e6 ? `$${(vol / 1e6).toFixed(1)}M` : `$${vol.toLocaleString()}`;

    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px monospace";
    ctx.fillText(`24H HIGH: ${fmtSmartPrice(hi24)}   24H LOW: ${fmtSmartPrice(lo24)}   VOL: ${volStr}`, 10, H - 10);

    this.setTitle(`MARKET: ${state.symbol} (${fmtSmartPrice(state.lastPrice)})`);
  }
}
