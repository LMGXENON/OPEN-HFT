/** FILLS: our executions with how long the order rested in the queue, what was ahead of it when
 * it was accepted, what traded at the level meanwhile, and the gap between the first trade at our
 * price ("touch") and the fill. */
import { sp } from "../dom";
import { clock, dur, fmtSmartPrice, fmtSmartQty, lj, lotDigits, rj, tickDigits } from "../fmt";
import type { Session } from "../session";
import { Panel, type RenderCtx } from "./base";

export class FillsPanel extends Panel {
  private readonly pxd: number;
  private readonly qd: number;

  constructor(s: Session) {
    super("fills", 4, "EXECUTIONS", s);
    this.pxd = tickDigits(s.tickSize);
    this.qd = lotDigits(s.lotSize);
  }

  render(c: RenderCtx): void {
    const s = this.s;
    const evN = s.eventsUpTo(c.t);
    const key = `${evN}|${this.rows}|${this.cols}`;
    if (!this.changed(key)) return;
    const rows = this.rows;
    const wide = this.cols >= 78;
    const head = sp(
      "d",
      `${lj("TIME", 12)} ${lj("SIDE", 4)} ${rj("PRICE", 10)} ${rj("QTY", 8)} ${rj("RESTED", 8)} ${rj("AHEAD@ACK", 9)} ${rj("TRADED", 7)}${wide ? " " + rj("TOUCH→FILL", 11) : ""}`,
    );
    const out: string[] = [head];
    let nFill = 0;
    let nTouch = 0;
    let nCross = 0;
    const waits: number[] = [];
    for (let j = s.fillEvents.length - 1; j >= 0; j--) {
      const i = s.fillEvents[j];
      if (i >= evN) continue;
      const li = s.lifeIndexOfEvent[i];
      const life = li >= 0 ? s.lives[li] : null;
      nFill++;
      const rested = life && Number.isFinite(life.exchAckT) ? life.exchFillT - life.exchAckT : NaN;
      if (Number.isFinite(rested)) waits.push(rested);
      const touched = life && Number.isFinite(life.touchT) ? life.exchFillT - life.touchT : NaN;
      if (Number.isFinite(touched)) nTouch++;
      else nCross++;
      if (out.length >= rows - 1) continue;
      const side = s.eSide[i];
      const cls = side === 1 ? "bid" : "ask";
      out.push(
        sp("w", lj(clock(s.t0, s.eExchT[i]), 12)) +
          " " +
          sp(cls, lj(side === 1 ? "BUY" : "SELL", 4)) +
          " " +
          sp("ours", rj((s.eExecTick[i] * s.tickSize).toFixed(this.pxd), 10)) +
          " " +
          sp("w", rj(s.eQty[i].toFixed(this.qd), 8)) +
          " " +
          sp("c", rj(dur(rested), 8)) +
          " " +
          sp("", rj(life && Number.isFinite(life.frontAtAck) ? life.frontAtAck.toFixed(this.qd) : "-", 9)) +
          " " +
          sp("", rj(Number.isFinite(s.eTradedAtLevel[i]) ? s.eTradedAtLevel[i].toFixed(this.qd) : "-", 7)) +
          (wide
            ? " " +
              sp(
                Number.isFinite(touched) ? "y" : "d",
                rj(Number.isFinite(touched) ? (touched < 1e6 ? "1st trade" : "+" + dur(touched)) : "crossed", 11),
              )
            : ""),
      );
    }
    if (nFill === 0) out.push(sp("d", "no executions yet"));
    this.content.innerHTML = out.join("\n");
    const ws = Float64Array.from(waits).sort();
    const med = ws.length ? ws[ws.length >> 1] : NaN;
    this.setTitle(`${nFill} fills │ rested p50 ${dur(med)} │ after touch ${nTouch} / crossed ${nCross}`);
  }

  renderLive(trades: Array<{ id: number; timeStr: string; side: "BUY" | "SELL"; price: number; qty: number; notional: number; queueWaitMs: number; frontQtyAtAck: number; isToxic: boolean; cpty?: string }>): void {
    const key = `${trades.length}|${trades[trades.length - 1]?.id ?? 0}`;
    if (!this.changed(key)) return;

    const rows = this.rows;
    const wide = this.cols >= 78;
    const head = sp(
      "d",
      `${lj("TIME", 12)} ${lj("SIDE", 4)} ${rj("PRICE", 10)} ${rj("QTY", 8)} ${rj("RESTED", 8)} ${rj("AHEAD@ACK", 9)} ${rj("CPTY", 5)}${wide ? " " + rj("NOTIONAL", 11) : ""}`
    );
    const out: string[] = [head];

    if (!trades || trades.length === 0) {
      out.push(sp("d", "no executions yet"));
      this.content.innerHTML = out.join("\n");
      this.setTitle("0 fills");
      return;
    }

    const recent = trades.slice(-rows + 1).reverse();
    for (const t of recent) {
      const sideCls = t.side === "BUY" ? "bid" : "ask";
      const cptyStr = (t.cpty || "JPM").padStart(5);

      const line =
        sp("w", lj(t.timeStr, 12)) +
        " " +
        sp(sideCls, lj(t.side, 4)) +
        " " +
        sp("ours", rj(fmtSmartPrice(t.price), 10)) +
        " " +
        sp("w", rj(fmtSmartQty(t.qty), 8)) +
        " " +
        sp("c", rj(`${t.queueWaitMs.toFixed(0)}ms`, 8)) +
        " " +
        sp("", rj(fmtSmartQty(t.frontQtyAtAck), 9)) +
        " " +
        sp("ours", cptyStr) +
        (wide ? " " + sp("w", rj(`$${t.notional.toFixed(0)}`, 11)) : "");

      out.push(line);
      if (out.length >= rows) break;
    }

    this.content.innerHTML = out.join("\n");
    const medWait = trades.length ? trades[Math.floor(trades.length / 2)].queueWaitMs : 0;
    const cleanMakers = trades.filter(t => !t.isToxic).length;
    const cleanPct = trades.length ? ((cleanMakers / trades.length) * 100).toFixed(0) : 100;
    this.setTitle(`${trades.length} fills │ rested p50 ${medWait.toFixed(0)}ms │ clean maker ${cleanPct}%`);
  }

}
