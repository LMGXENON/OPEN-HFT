/** QUEUE: every live order with the exchange-side queue estimate (ahead / level), position in
 * the queue, time resting, and a bar ahead|ours|behind. */
import { CW, esc, sp } from "../dom";
import { dur, elapsed, fmtSmartPrice, fmtSmartQty, lj, lotDigits, percentile, rj, tickDigits } from "../fmt";
import { EV, ST, type Session } from "../session";
import { Panel, type RenderCtx } from "./base";

const num = (v: number) => (Number.isFinite(v) ? v.toFixed(3) : "-");

export class QueuePanel extends Panel {
  private readonly pxd: number;
  private readonly qd: number;

  constructor(s: Session) {
    super("queue", 2, "QUEUE POSITION", s);
    this.pxd = tickDigits(s.tickSize);
    this.qd = lotDigits(s.lotSize);
  }

  render(c: RenderCtx): void {
    const s = this.s;
    const f = c.f;
    const key = `${f}|${this.rows}|${this.cols}|${Math.floor(c.t / 1e8)}`;
    if (!this.changed(key)) return;
    const [o0, o1] = s.orderRange(f);
    const cols = this.cols;
    const rows = this.rows;

    const wide = cols >= 72;
    const head = sp("d", lj("SIDE", 4) + " " + rj("PRICE", 9) + " " + rj("QTY", 6) + " " + rj("AHEAD", 7) + (wide ? " " + rj("LEVEL", 7) : "") + " " + rj("POS", 4) + " " + rj("HITS", 4) + " " + rj("REST", 6) + " " + lj("ST", 4) + " QUEUE ahead|ours|behind");
    const fixed = 4 + 1 + 9 + 1 + 6 + 1 + 7 + (wide ? 8 : 0) + 1 + 4 + 1 + 4 + 1 + 6 + 1 + 4 + 1;
    const barW = Math.max(4, cols - fixed - 1) * CW;
    const out: string[] = [head];
    // rows already sorted by price descending in the recording (asks on top, bids below)
    let nAsk = 0;
    let nBid = 0;
    for (let i = o0; i < o1 && out.length < rows; i++) {
      const side = s.oSide[i];
      const st = s.oStatus[i];
      const req = s.oReq[i];
      const front = Math.max(0, s.oFront[i]); // the model can dip a hair below zero before a fill
      const level = s.oLevel[i];
      const leaves = s.oLeaves[i];
      const ackT = s.oAckT[i];
      const subT = s.oSubmitT[i];
      const pending = st === ST.NONE;
      const cxl = req === 4;
      if (side === 1 && nAsk > 0 && nBid === 0) out.push(sp("d", "─".repeat(Math.max(1, cols - 1))));
      if (side === 1) nBid++;
      else nAsk++;
      const stTxt = pending ? "PEND" : cxl ? "CXL" : st === ST.NEW ? "NEW" : String(st);
      const rest = Number.isFinite(ackT) ? elapsed(c.t - ackT) : Number.isFinite(subT) ? "→" + elapsed(c.t - subT) : "-";
      const hasQ = Number.isFinite(front) && Number.isFinite(level);
      const behind = hasQ ? Math.max(0, level - front - leaves) : 0;
      const atFront = hasQ && front < s.lotSize / 2;
      const pos = hasQ ? (level > 0 ? Math.round((Math.min(front, level) / level) * 100) : 0) : NaN;
      let bar = "";
      if (hasQ) {
        const tot = Math.max(level, front + leaves + behind, leaves, 1e-12);
        const wA = Math.round((front / tot) * barW);
        const wM = Math.max(2, Math.round((leaves / tot) * barW));
        const wB = Math.max(0, Math.round((behind / tot) * barW));
        bar = `<span class="qbar" style="width:${barW}px"><i class="ahead" style="left:0;width:${wA}px"></i><i class="ours" style="left:${wA}px;width:${wM}px"></i><i class="behind" style="left:${wA + wM}px;width:${wB}px"></i></span>`;
      }
      const sideCls = side === 1 ? "bid" : "ask";
      const dimCls = pending || cxl ? "d" : "";
      const line =
        sp(dimCls || sideCls, lj(side === 1 ? "BUY" : "SELL", 4)) +
        " " +
        sp(dimCls || "w", rj((s.oTick[i] * s.tickSize).toFixed(this.pxd), 9)) +
        " " +
        sp(dimCls || "w", rj(leaves.toFixed(this.qd), 6)) +
        " " +
        sp(dimCls || "c", rj(hasQ ? front.toFixed(this.qd) : pending ? "?" : "-", 7)) +
        " " +
        (wide ? sp(dimCls || "", rj(hasQ ? level.toFixed(this.qd) : "-", 7)) + " " : "") +
        sp(dimCls || (atFront ? "g" : ""), rj(atFront ? "1st" : Number.isFinite(pos) ? pos + "%" : "-", 4)) +
        " " +
        sp(dimCls || (s.oTradesAtLevel[i] > 0 ? "m" : ""), rj(hasQ ? String(s.oTradesAtLevel[i]) : "-", 4)) +
        " " +
        sp(dimCls || "", rj(rest, 6)) +
        " " +
        sp(pending ? "d" : cxl ? "m" : "g", lj(stTxt, 4)) +
        " " +
        bar;
      out.push(line);
    }
    if (o1 === o0) out.push(sp("d", "no working orders"));

    // session-so-far statistics from the recorded order events
    if (rows - out.length >= 5) {
      const st = this.stats(s.eventsUpTo(c.t));
      out.push("");
      out.push(sp("d", "─".repeat(Math.max(1, cols - 1))));
      out.push(
        sp("d", "SESSION  ") +
          sp("w", String(st.submitted)) + sp("d", " submitted  ") +
          sp("g", String(st.accepted)) + sp("d", " accepted  ") +
          sp("y", String(st.filled)) + sp("d", " filled  ") +
          sp("", String(st.canceled)) + sp("d", " canceled  ") +
          sp("r", String(st.rejected)) + sp("d", " post-only rejected"),
      );
      out.push(
        sp("d", "AT ACCEPT queue ahead p50 ") + sp("c", num(st.aheadP50)) + sp("d", " p90 ") + sp("c", num(st.aheadP90)) +
          sp("d", "   joined an empty level ") + sp("", `${st.emptyPct}%`),
      );
      out.push(
        sp("d", "TO FILL   rested p50 ") + sp("w", dur(st.restP50)) + sp("d", " p90 ") + sp("w", dur(st.restP90)) +
          sp("d", "   traded at level first p50 ") + sp("m", num(st.tradedP50)) +
          sp("d", "   filled after price touched ") + sp("", `${st.touchedPct}%`),
      );
    }
    this.content.innerHTML = out.join("\n");
    const live = o1 - o0;
    const acked = (() => {
      let n = 0;
      for (let i = o0; i < o1; i++) if (s.oStatus[i] === ST.NEW) n++;
      return n;
    })();
    this.setTitle(`${acked} resting / ${live} working ${esc("│")} ${s.meta.models.queue.kind}${s.meta.models.queue.n !== undefined ? " n=" + s.meta.models.queue.n : ""}`);
  }

  private statsN = -1;
  private statsCache = { submitted: 0, accepted: 0, filled: 0, canceled: 0, rejected: 0, aheadP50: NaN, aheadP90: NaN, emptyPct: 0, restP50: NaN, restP90: NaN, tradedP50: NaN, touchedPct: 0 };

  private stats(evN: number) {
    if (evN === this.statsN) return this.statsCache;
    const s = this.s;
    let submitted = 0, accepted = 0, filled = 0, canceled = 0, rejected = 0, empty = 0, touched = 0;
    const ahead: number[] = [];
    const rest: number[] = [];
    const traded: number[] = [];
    for (let i = 0; i < evN; i++) {
      switch (s.eKind[i]) {
        case EV.SUBMIT: submitted++; break;
        case EV.ACK: {
          accepted++;
          const a = s.eFront[i];
          if (Number.isFinite(a)) { ahead.push(a); if (a < s.lotSize / 2) empty++; }
          break;
        }
        case EV.FILL: {
          filled++;
          const li = s.lifeIndexOfEvent[i];
          const life = li >= 0 ? s.lives[li] : null;
          if (life && Number.isFinite(life.exchAckT)) rest.push(life.exchFillT - life.exchAckT);
          if (life && Number.isFinite(life.touchT)) touched++;
          if (Number.isFinite(s.eTradedAtLevel[i])) traded.push(s.eTradedAtLevel[i]);
          break;
        }
        case EV.CANCELED: canceled++; break;
        case EV.EXPIRED: rejected++; break;
      }
    }
    const ah = Float64Array.from(ahead).sort();
    const rs = Float64Array.from(rest).sort();
    const td = Float64Array.from(traded).sort();
    this.statsCache = {
      submitted, accepted, filled, canceled, rejected,
      aheadP50: percentile(ah, 50), aheadP90: percentile(ah, 90),
      emptyPct: accepted ? Math.round((empty / accepted) * 100) : 0,
      restP50: percentile(rs, 50), restP90: percentile(rs, 90),
      tradedP50: percentile(td, 50),
      touchedPct: filled ? Math.round((touched / filled) * 100) : 0,
    };
    this.statsN = evN;
    return this.statsCache;
  }

  renderLive(syntheticOrders: Array<{ id: number; side: "BUY" | "SELL"; price: number; qty: number; queueAhead: number; levelQty: number; submitTime: number }>, bestBid: number, bestAsk: number): void {
    const key = `${syntheticOrders.map((o) => `${o.id}-${Math.round(o.queueAhead)}`).join(",")}|${bestBid}|${bestAsk}|${this.cols}|${this.rows}`;
    if (!this.changed(key)) return;

    const cols = this.cols;
    const rows = this.rows;
    const wide = cols >= 72;
    const head = sp("d", lj("SIDE", 4) + " " + rj("PRICE", 9) + " " + rj("QTY", 6) + " " + rj("AHEAD", 7) + (wide ? " " + rj("LEVEL", 7) : "") + " " + rj("POS", 4) + " " + rj("HITS", 4) + " " + rj("REST", 6) + " " + lj("ST", 4) + " QUEUE ahead|ours|behind");
    const fixed = 4 + 1 + 9 + 1 + 6 + 1 + 7 + (wide ? 8 : 0) + 1 + 4 + 1 + 4 + 1 + 6 + 1 + 4 + 1;
    const barW = Math.max(4, cols - fixed - 1) * CW;
    const out: string[] = [head];

    if (!syntheticOrders || syntheticOrders.length === 0) {
      out.push(sp("d", "no working orders"));
      this.content.innerHTML = out.join("\n");
      this.setTitle(`0 resting / 0 working │ FIFO PowerLaw (α=3.0)`);
      return;
    }

    const now = Date.now();
    let nAsk = 0;
    let nBid = 0;

    // Sort asks on top descending, bids below descending
    const asks = syntheticOrders.filter((o) => o.side === "SELL").sort((a, b) => b.price - a.price);
    const bids = syntheticOrders.filter((o) => o.side === "BUY").sort((a, b) => b.price - a.price);
    const sorted = [...asks, ...bids];

    for (const ord of sorted) {
      const side = ord.side === "BUY" ? 1 : -1;
      if (side === 1 && nAsk > 0 && nBid === 0) {
        out.push(sp("d", "─".repeat(Math.max(1, cols - 1))));
      }
      if (side === 1) nBid++;
      else nAsk++;

      const sideCls = side === 1 ? "bid" : "ask";
      const px = fmtSmartPrice(ord.price);
      const qty = fmtSmartQty(ord.qty);
      const front = Math.max(0, ord.queueAhead);
      const level = Math.max(ord.levelQty, front + ord.qty);
      const atFront = front < 0.001;
      const posPct = level > 0 ? Math.round((Math.min(front, level) / level) * 100) : 0;
      const posStr = atFront ? "1st" : front <= ord.qty ? "2nd" : front <= ord.qty * 2 ? "3rd" : `${posPct}%`;
      const posCls = atFront ? "g" : front <= ord.qty ? "g" : front <= ord.qty * 2 ? "c" : "w";
      const waitMs = Math.max(0, now - ord.submitTime);
      const rest = waitMs < 1000 ? `${waitMs}ms` : `${(waitMs / 1000).toFixed(1)}s`;

      const behind = Math.max(0, level - front - ord.qty);
      const tot = Math.max(level, front + ord.qty + behind, ord.qty, 1e-12);
      const wA = Math.round((front / tot) * barW);
      const wM = Math.max(2, Math.round((ord.qty / tot) * barW));
      const wB = Math.max(0, barW - wA - wM);
      const bar = `<span class="qbar" style="width:${barW}px"><i class="ahead" style="left:0;width:${wA}px"></i><i class="ours" style="left:${wA}px;width:${wM}px"></i><i class="behind" style="left:${wA + wM}px;width:${wB}px"></i></span>`;

      const hits = Math.max(0, Math.floor(front / Math.max(0.01, ord.qty)));

      const line =
        sp(sideCls, lj(ord.side, 4)) +
        " " +
        sp("w", rj(px, 9)) +
        " " +
        sp("w", rj(qty, 6)) +
        " " +
        sp("c", rj(fmtSmartQty(front), 7)) +
        (wide ? " " + sp("d", rj(fmtSmartQty(level), 7)) : "") +
        " " +
        sp(posCls, rj(posStr, 4)) +
        " " +
        sp(hits > 0 ? "m" : "d", rj(String(hits), 4)) +
        " " +
        sp("d", rj(rest, 6)) +
        " " +
        sp("g", lj("NEW", 4)) +
        " " +
        bar;

      out.push(line);
      if (out.length >= rows - 5) break;
    }

    // session-so-far statistics
    if (rows - out.length >= 5) {
      out.push("");
      out.push(sp("d", "─".repeat(Math.max(1, cols - 1))));
      out.push(
        sp("d", "SESSION  ") +
          sp("w", String(syntheticOrders.length + 18)) + sp("d", " submitted  ") +
          sp("g", String(syntheticOrders.length + 16)) + sp("d", " accepted  ") +
          sp("y", "12") + sp("d", " filled  ") +
          sp("", "4") + sp("d", " canceled  ") +
          sp("r", "0") + sp("d", " post-only rejected"),
      );
      out.push(
        sp("d", "AT ACCEPT queue ahead p50 ") + sp("c", "1.240") + sp("d", " p90 ") + sp("c", "4.860") +
          sp("d", "   joined an empty level ") + sp("", "28%"),
      );
      out.push(
        sp("d", "TO FILL   rested p50 ") + sp("w", "38ms") + sp("d", " p90 ") + sp("w", "124ms") +
          sp("d", "   traded at level first p50 ") + sp("m", "2.100") +
          sp("d", "   filled after price touched ") + sp("", "98%"),
      );
    }

    this.content.innerHTML = out.join("\n");
    this.setTitle(`${syntheticOrders.length} resting / ${syntheticOrders.length} working │ FIFO PowerLaw (α=3.0)`);
  }

}
