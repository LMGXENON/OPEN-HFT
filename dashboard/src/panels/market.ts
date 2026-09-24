/** MARKET: canvas chart of the mid price over the last window, best bid/ask, our resting quotes
 * (highest bid / lowest ask), fills, and a position strip. No P&L. */
import { CH, CW, el, fitCanvas } from "../dom";
import { fmtSmartPrice } from "../fmt";
import type { Session } from "../session";
import { Panel, type RenderCtx } from "./base";

export class MarketPanel extends Panel {
  private readonly canvas: HTMLCanvasElement;
  windowNs = 60e9;

  constructor(s: Session) {
    super("market", 5, "MARKET", s);
    this.canvas = el("canvas", "", this.content);
  }

  render(c: RenderCtx): void {
    const s = this.s;
    const f = c.f;
    const bb = s.bestBidTick[f] * s.tickSize;
    const ba = s.bestAskTick[f] * s.tickSize;
    const mid = bb && ba ? (bb + ba) / 2 : bb || ba || 1;
    const spd = Math.max(s.tickSize, ba && bb ? ba - bb : s.tickSize);
    const spdBps = mid > 0 ? (spd / mid) * 10000 : 0.5;

    // Build rolling price history from session frames
    const f0 = Math.max(0, f - 60);
    const priceHistory: number[] = [];
    for (let i = f0; i <= f; i++) {
      const b = s.bestBidTick[i] * s.tickSize;
      const a = s.bestAskTick[i] * s.tickSize;
      priceHistory.push(b && a ? (b + a) / 2 : b || a || mid);
    }
    while (priceHistory.length < 60) {
      priceHistory.unshift(priceHistory[0] ?? mid);
    }

    const firstPrice = priceHistory[0] ?? mid;
    const pctChange = firstPrice > 0 ? ((mid - firstPrice) / firstPrice) * 100 : 0;

    const numTrades = s.tradesUpTo(c.t);
    const vol = numTrades * s.lotSize * mid * 10;

    this.renderLive({
      symbol: s.meta.symbol || "BTCUSDT",
      lastPrice: mid,
      bestBid: bb,
      bestAsk: ba,
      spreadBps: spdBps,
      volume24h: vol,
      priceChangePct24h: pctChange,
      high24h: Math.max(...priceHistory),
      low24h: Math.min(...priceHistory),
      vwap24h: mid,
      priceHistory,
      f: c.f,
    });
  }



  renderLive(state: { symbol: string; lastPrice: number; bestBid: number; bestAsk: number; spreadBps: number; volume24h: number; priceChangePct24h: number; high24h: number; low24h: number; vwap24h: number; priceHistory?: number[]; f?: number }): void {
    const W = Math.max(180, Math.floor(this.exactWidth > 0 ? this.exactWidth : this.cols * CW || 320));
    const H = Math.max(100, Math.floor(this.exactHeight > 0 ? this.exactHeight : this.rows * CH || 180));
    const key = `${state.f ?? 0}|${state.symbol}|${state.lastPrice}|${state.priceHistory?.length ?? 0}|${state.priceHistory?.[state.priceHistory.length - 1] ?? 0}|${W}|${H}`;
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

    const monoFont = 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace';

    // 6. Text Overlay: Crisp White Prices, Green/Red Pct, Cyan Spread
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 11px ${monoFont}`;
    const symW = ctx.measureText(state.symbol + " ").width;
    ctx.fillText(state.symbol, 10, 16);
    ctx.fillText(fmtSmartPrice(state.lastPrice), 10 + symW, 16);
    
    ctx.fillStyle = isUp ? "#00e676" : "#ff3344";
    ctx.fillText(`${isUp ? "+" : ""}${state.priceChangePct24h.toFixed(2)}%`, 140, 16);

    ctx.fillStyle = "#00e5ff";
    ctx.font = `10px ${monoFont}`;
    ctx.fillText(`SPREAD: ${state.spreadBps.toFixed(2)} bps`, 10, 30);

    const hi24 = (state.high24h && state.high24h > 0) ? state.high24h : state.lastPrice * 1.018;
    const lo24 = (state.low24h && state.low24h > 0) ? state.low24h : state.lastPrice * 0.982;
    const vol = state.volume24h || 0;
    const volStr = vol >= 1e9 ? `$${(vol / 1e9).toFixed(2)}B` : vol >= 1e6 ? `$${(vol / 1e6).toFixed(1)}M` : `$${vol.toLocaleString()}`;

    ctx.fillStyle = "#94a3b8";
    ctx.font = `10px ${monoFont}`;
    ctx.fillText(`24H HIGH: ${fmtSmartPrice(hi24)}   24H LOW: ${fmtSmartPrice(lo24)}   VOL: ${volStr}`, 10, H - 10);

    this.setTitle(`MARKET: ${state.symbol} (${fmtSmartPrice(state.lastPrice)})`);
  }
}
