/** LATENCY: feed latency (exchange timestamp -> local receipt) over time, and the order round trip
 * (request -> exchange matching engine -> response received) for the most recent order events. */
import { CH, CW, cssVar, el, fitCanvas, sp } from "../dom";
import { lj, ms, percentile, rj, tickDigits } from "../fmt";
import { EV, EV_NAME, type Session } from "../session";
import { Panel, type RenderCtx } from "./base";

const WINDOW_NS = 60e9;

export class LatencyPanel extends Panel {
  private readonly top: HTMLElement;
  private readonly spark: HTMLCanvasElement;
  private readonly mid: HTMLElement;
  private readonly trips: HTMLCanvasElement;
  private readonly foot: HTMLElement;
  private readonly pxd: number;

  constructor(s: Session) {
    super("latency", 3, "LATENCY", s);
    this.pxd = tickDigits(s.tickSize);
    this.top = el("div", "", this.content);
    this.spark = el("canvas", "", this.content);
    this.mid = el("div", "", this.content);
    this.trips = el("canvas", "", this.content);
    this.foot = el("div", "", this.content);
  }

  render(c: RenderCtx): void {
    const s = this.s;
    const f = c.f;
    const evN = s.eventsUpTo(c.t);
    const key = `${f}|${evN}|${this.rows}|${this.cols}`;
    if (!this.changed(key)) return;
    const rows = this.rows;
    const cols = this.cols;
    const W = cols * CW;

    // ---- feed latency, per-frame mean over the last 60 s ----
    const f0 = s.frameAt(Math.max(0, c.t - WINDOW_NS));
    const vals: number[] = [];
    for (let i = f0; i <= f; i++) if (Number.isFinite(s.feedMean[i])) vals.push(s.feedMean[i]);
    const sorted = Float64Array.from(vals).sort();
    const last = s.feedLast[f];
    const fmax = s.feedMax[f];
    this.top.innerHTML =
      sp("d", "FEED LATENCY  exchange ts → local receipt   ") +
      sp("w", `${ms(last * 1e6)} ms`) +
      "\n" +
      sp("d", "frame max ") +
      sp("", `${ms(fmax * 1e6)} ms`) +
      sp("d", "  60s p50 ") +
      sp("c", `${ms(percentile(sorted, 50) * 1e6)}`) +
      sp("d", " p95 ") +
      sp("c", `${ms(percentile(sorted, 95) * 1e6)} ms`) +
      sp("d", `  ${s.feedBatches[f]} msg this frame`);

    // sparkline: 1 px per frame (600 frames = 60 s at 100 ms), max envelope + mean
    const sparkRows = Math.max(3, Math.min(6, Math.floor((rows - 10) / 2)));
    const ctx = fitCanvas(this.spark, W, sparkRows * CH);
    const H = this.spark.height;
    ctx.fillStyle = cssVar("--blue-dark");
    ctx.fillRect(0, 0, W, H);
    const nF = Math.min(W, Math.floor(WINDOW_NS / s.frameNs));
    let vmax = 0;
    for (let i = Math.max(0, f - nF + 1); i <= f; i++) if (Number.isFinite(s.feedMax[i])) vmax = Math.max(vmax, s.feedMax[i]);
    if (vmax <= 0) vmax = 1;
    const scale = (H - 2) / vmax;
    ctx.fillStyle = cssVar("--ahead-bar");
    for (let i = Math.max(0, f - nF + 1), x = W - (f - i) - 1; i <= f; i++, x++) {
      const v = s.feedMax[i];
      if (!Number.isFinite(v)) continue;
      const h = Math.max(1, Math.round(v * scale));
      ctx.fillRect(x, H - h, 1, h);
    }
    ctx.fillStyle = cssVar("--cyan");
    for (let i = Math.max(0, f - nF + 1), x = W - (f - i) - 1; i <= f; i++, x++) {
      const v = s.feedMean[i];
      if (!Number.isFinite(v)) continue;
      ctx.fillRect(x, H - Math.max(1, Math.round(v * scale)), 1, 1);
    }
    ctx.fillStyle = cssVar("--gray");
    ctx.font = `8px EGA8`;
    ctx.fillText(`${vmax.toFixed(0)}ms`, 2, 9);
    ctx.fillText("0", 2, H - 2);
    ctx.fillText("-60s", W - 36, H - 2);

    // ---- order round trips ----
    const nTrip = 0;
    const trips: { i: number; entry: number; resp: number }[] = [];
    for (let i = evN - 1; i >= 0 && trips.length < nTrip; i--) {
      const k = s.eKind[i];
      if (k === EV.SUBMIT || k === EV.CANCEL_SENT) continue;
      const exch = s.eExchT[i];
      if (!Number.isFinite(exch)) continue;
      const entry = k === EV.ACK || k === EV.EXPIRED || k === EV.CANCELED ? exch - s.eReqT[i] : NaN;
      const resp = s.eT[i] - exch;
      trips.push({ i, entry, resp });
    }
    this.mid.innerHTML =
      sp("d", "ORDER ROUND TRIP  request → ") + sp("c", "matching engine") + sp("d", " → ") + sp("m", "response received");
    const tctx = fitCanvas(this.trips, W, nTrip * CH);
    tctx.fillStyle = cssVar("--blue");
    tctx.fillRect(0, 0, W, this.trips.height);
    let tmax = 1;
    for (const t of trips) tmax = Math.max(tmax, (Number.isFinite(t.entry) ? t.entry : 0) + t.resp);
    const labelW = 24 * CW;
    const scaleT = (W - labelW - 8 * CW) / tmax;
    tctx.font = `16px VGA`;
    tctx.textBaseline = "top";
    trips.forEach((t, r) => {
      const y = r * CH;
      const i = t.i;
      const name = EV_NAME[s.eKind[i]] ?? "?";
      const side = s.eSide[i] === 1 ? "BUY " : "SELL";
      const px = (s.eTick[i] * s.tickSize).toFixed(this.pxd);
      tctx.fillStyle = s.eKind[i] === EV.FILL ? cssVar("--yellow") : s.eKind[i] === EV.EXPIRED ? cssVar("--red") : cssVar("--gray");
      tctx.fillText(`${lj(name, 8)} ${side} ${px}`, 0, y);
      let x = labelW;
      if (Number.isFinite(t.entry)) {
        const w = Math.max(1, Math.round(t.entry * scaleT));
        tctx.fillStyle = cssVar("--cyan-dark");
        tctx.fillRect(x, y + 3, w, CH - 6);
        x += w;
      }
      const w2 = Math.max(1, Math.round(t.resp * scaleT));
      tctx.fillStyle = cssVar("--magenta-dark");
      tctx.fillRect(x, y + 3, w2, CH - 6);
      x += w2;
      tctx.fillStyle = cssVar("--white");
      const lbl = Number.isFinite(t.entry) ? `${ms(t.entry, 0)}+${ms(t.resp, 0)}ms` : `${ms(t.resp, 0)}ms`;
      tctx.fillText(lbl, Math.min(x + CW, W - lbl.length * CW), y);
    });

    // ---- session stats ----
    const entries: number[] = [];
    const resps: number[] = [];
    for (let i = Math.max(0, evN - 400); i < evN; i++) {
      const k = s.eKind[i];
      const exch = s.eExchT[i];
      if (!Number.isFinite(exch)) continue;
      if (k === EV.ACK) entries.push(exch - s.eReqT[i]);
      if (k === EV.ACK || k === EV.FILL || k === EV.CANCELED || k === EV.EXPIRED) resps.push(s.eT[i] - exch);
    }
    const es = Float64Array.from(entries).sort();
    const rs = Float64Array.from(resps).sort();
    this.foot.innerHTML =
      sp("d", "last 400 ") +
      sp("c", "ENTRY") +
      sp("d", ` p50 ${rj(ms(percentile(es, 50)), 6)} p95 ${rj(ms(percentile(es, 95)), 6)} ms   `) +
      sp("m", "RESP") +
      sp("d", ` p50 ${rj(ms(percentile(rs, 50)), 6)} p95 ${rj(ms(percentile(rs, 95)), 6)} ms`);
    const lat = s.meta.models.latency;
    this.setTitle(lat.kind === "IntpOrderLatency" ? "IntpOrderLatency" : `ConstantLatency ${lat.entry_us / 1000}/${lat.response_us / 1000} ms`);
  }

  renderLive(state: any, stats: { pingMs: number; p50: number; p95: number; p99: number; samples: number[]; msgRate: number }): void {
    const W = this.exactWidth;
    const rows = this.rows;
    const cols = this.cols;
    const key = `${Math.round(stats.pingMs * 10)}|${Math.round(stats.p50 * 10)}|${stats.msgRate}|${W}|${rows}|${cols}`;
    if (!this.changed(key)) return;

    // 1. Header Metrics
    this.top.innerHTML =
      sp("d", "FEED LATENCY  exchange ts → local receipt   ") +
      sp("w", `${stats.pingMs.toFixed(1)} ms`) +
      "\n" +
      sp("d", "jitter p50 ") +
      sp("g", `${stats.p50.toFixed(1)} ms`) +
      sp("d", "  p95 ") +
      sp("c", `${stats.p95.toFixed(1)} ms`) +
      sp("d", "  p99 ") +
      sp("r", `${stats.p99.toFixed(1)} ms`) +
      sp("d", `  rate: `) +
      sp("w", `${stats.msgRate} msg/s`);

    // 2. Gateway Ping Sparkline Canvas
    const isFocus = rows >= 20;
    const sparkRows = isFocus ? 8 : Math.max(3, Math.min(5, Math.floor((rows - 6) / 2)));
    const ctx = fitCanvas(this.spark, W, sparkRows * CH);
    const H = this.spark.height;
    ctx.fillStyle = "#05070d";
    ctx.fillRect(0, 0, W, H);

    // Draw grid lines in sparkline
    ctx.strokeStyle = "rgba(36, 25, 14, 0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(H / 2));
    ctx.lineTo(W, Math.round(H / 2));
    ctx.stroke();

    const samples = stats.samples || [];
    if (samples.length > 1) {
      const maxVal = Math.max(10, ...samples);
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i < samples.length; i++) {
        const x = (i / (samples.length - 1)) * (W - 8) + 4;
        const y = H - (samples[i] / maxVal) * (H - 8) - 4;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Axis labels
      ctx.fillStyle = "#78716c";
      ctx.font = "8px EGA8";
      ctx.fillText(`${maxVal.toFixed(0)}ms`, 4, 9);
      ctx.fillText("0ms", 4, H - 2);
      ctx.fillText("-60s", W - 32, H - 2);
    }

    // 3. Sub-header
    // 3. Sub-header - Removed in live mode since we do not have real order trips
    this.mid.innerHTML = "";
    
    // 4. Round Trip Canvas - Removed in live mode since we do not have real order trips
    this.trips.width = 0;
    this.trips.height = 0;

    // 5. Hardware & Telemetry Audit Grid (Fills all space with zero void)
    const out: string[] = [];
    const usedRows = 4 + sparkRows; // Top(2) + Mid(2) + Spark + Trips
    
    if (isFocus && rows - usedRows >= 11) {
      out.push("");
      out.push(sp("d", "─".repeat(Math.max(1, cols - 2))));
      out.push(
        sp("ours", "NETWORK INGRESS TELEMETRY & LIVE STATE DIAGNOSTICS")
      );
      out.push(sp("d", "─".repeat(Math.max(1, cols - 2))));
      
      const megabytes = (state.bytesReceived / 1024 / 1024).toFixed(2);
      
      out.push(
        sp("d", "CONNECTION STATE     : ") + sp(state.connected ? "g" : "r", state.connected ? "CONNECTED" : "DISCONNECTED") +
        sp("d", " (WebSocket Secure / Direct Ingress)")
      );
      out.push(
        sp("d", "UPTIME (SESSION)     : ") + sp("g", `${state.uptimeSec}s`) +
        sp("d", ` (Continuous Feed Monitor)`)
      );
      out.push(
        sp("d", "PACKETS RECEIVED     : ") + sp("w", `${state.packetsReceived.toLocaleString()}`) +
        sp("d", ` (Total JSON Payloads Processed)`)
      );
      out.push(
        sp("d", "DATA TRANSFERRED     : ") + sp("c", `${megabytes} MB`) +
        sp("d", ` (Cumulative Network Bandwidth)`)
      );
      out.push(
        sp("d", "AVERAGE PACKET RATE  : ") + sp("g", `${(state.packetsReceived / Math.max(1, state.uptimeSec)).toFixed(1)} pkts/s`) +
        sp("d", ` (Sustained Ingress Throughput)`)
      );
      out.push(
        sp("d", "LIVE LATENCY JITTER  : ") + sp("w", `${(stats.pingMs - stats.p50).toFixed(1)} ms`) +
        sp("d", ` (Deviation from Moving Median)`)
      );
    }

    this.foot.innerHTML = out.join("\n");

    this.setTitle(`FEED LATENCY: ${stats.pingMs.toFixed(1)}ms (p95: ${stats.p95.toFixed(1)}ms)`);
  }

}
