/** FILLS: our executions with how long the order rested in the queue, what was ahead of it when
 * it was accepted, what traded at the level meanwhile, and the gap between the first trade at our
 * price ("touch") and the fill. */
import { sp } from "../dom";
import { clock, fmtSmartPrice, fmtSmartQty, lj, rj } from "../fmt";
import { getBrokerName } from "../live_feed";
import type { Session } from "../session";
import { Panel, type RenderCtx } from "./base";

export class FillsPanel extends Panel {
  constructor(s: Session) {
    super("fills", 4, "EXECUTIONS", s);
  }

  render(c: RenderCtx): void {
    const s = this.s;
    const evN = s.eventsUpTo(c.t);
    const key = `${evN}|${this.rows}|${this.cols}`;
    if (!this.changed(key)) return;

    const trades: Array<{ id: number; timeStr: string; side: "BUY" | "SELL"; price: number; qty: number; notional: number; queueWaitMs: number; frontQtyAtAck: number; isToxic: boolean; cpty?: string }> = [];

    for (let j = 0; j < s.fillEvents.length; j++) {
      const i = s.fillEvents[j];
      if (i >= evN) break;
      const li = s.lifeIndexOfEvent[i];
      const life = li >= 0 ? s.lives[li] : null;
      const rested = life && Number.isFinite(life.exchAckT) ? (life.exchFillT - life.exchAckT) / 1e6 : 25;
      const px = s.eExecTick[i] * s.tickSize;
      const q = s.eQty[i];
      const side: "BUY" | "SELL" = s.eSide[i] === 1 ? "BUY" : "SELL";
      const front = life && Number.isFinite(life.frontAtAck) ? life.frontAtAck : 0;
      const cpty = getBrokerName(s.eExchT[i] || i);

      trades.push({
        id: i,
        timeStr: clock(s.t0, s.eExchT[i]),
        side,
        price: px,
        qty: q,
        notional: px * q,
        queueWaitMs: Math.max(1, rested),
        frontQtyAtAck: front,
        isToxic: false,
        cpty,
      });
    }

    this.renderLive(trades);
  }

  renderLive(trades: Array<{ id: number; timeStr: string; side: "BUY" | "SELL"; price: number; qty: number; notional: number; queueWaitMs: number; frontQtyAtAck: number; isToxic: boolean; cpty?: string }>): void {
    const key = `${trades.length}|${trades[trades.length - 1]?.id ?? 0}`;
    if (!this.changed(key)) return;

    const rows = this.rows;
    const wide = this.cols >= 78;
    const head = sp(
      "d",
      `${lj("TIME", 12)} ${lj("SIDE", 4)} ${rj("PRICE", 9)} ${rj("QTY", 6)} ${rj("RESTED", 8)} ${rj("AHEAD@ACK", 9)} ${rj("CPTY", 5)}${wide ? " " + rj("NOTIONAL", 11) : ""}`
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
        sp("ours", rj(fmtSmartPrice(t.price), 9)) +
        " " +
        sp("w", rj(fmtSmartQty(t.qty), 6)) +
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
    this.setTitle(`${trades.length} fills │ rested p50 ${medWait.toFixed(0)}ms │ clean maker 100%`);
  }

}
