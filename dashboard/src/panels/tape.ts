import { sp } from "../dom";
import { clock, fmtSmartPrice, fmtSmartQty, lj, lotDigits, rj, tickDigits } from "../fmt";
import { EV, type Session } from "../session";
import { Panel, type RenderCtx } from "./base";

export class TapePanel extends Panel {
  private readonly pxd: number;
  private readonly qd: number;

  constructor(s: Session) {
    super("tape", 6, "TRADES", s);
    this.pxd = tickDigits(s.tickSize);
    this.qd = lotDigits(s.lotSize);
  }

  render(c: RenderCtx): void {
    const s = this.s;
    const n = s.tradesUpTo(c.t);
    const evN = s.eventsUpTo(c.t);
    const key = `${n}|${evN}|${this.rows}|${this.cols}`;
    if (!this.changed(key)) return;
    const rows = this.rows;
    type Row = { t: number; html: string };
    const list: Row[] = [];
    const wide = this.cols >= 44;
    for (let i = n - 1; i >= 0 && list.length < rows; i--) {
      const side = s.trSide[i];
      const cls = side === 1 ? "bid" : "ask";
      const t = s.trLocalT[i];
      const tag = side === 1 ? "BUY " : "SELL";
      const line =
        sp("d", clock(s.t0, s.trExchT[i])) +
        " " +
        sp(cls, rj((s.trTick[i] * s.tickSize).toFixed(this.pxd), 9)) +
        " " +
        sp("w", rj(s.trQty[i].toFixed(this.qd), 8)) +
        " " +
        sp(cls, tag) +
        (wide ? sp("d", `  rx +${((s.trLocalT[i] - s.trExchT[i]) / 1e6).toFixed(1)}ms`) : "");
      list.push({ t, html: line });
    }
    const tMin = list.length ? list[list.length - 1].t : -Infinity;
    for (let i = evN - 1; i >= 0; i--) {
      if (s.eKind[i] !== EV.FILL) continue;
      const t = s.eT[i];
      if (t < tMin) break;
      const side = s.eSide[i];
      const line = `<span class="sel">${lj(
        `${clock(s.t0, Number.isFinite(s.eExchT[i]) ? s.eExchT[i] : t)} ${rj((s.eExecTick[i] * s.tickSize).toFixed(this.pxd), 9)} ${rj(
          s.eQty[i].toFixed(this.qd),
          8,
        )} OUR ${side === 1 ? "BUY " : "SELL"} FILLED`,
        Math.max(1, this.cols - 1),
      )}</span>`;
      list.push({ t, html: line });
    }
    list.sort((a, b) => b.t - a.t);
    this.content.innerHTML = list
      .slice(0, rows)
      .map((r) => r.html)
      .join("\n");
    // 1-minute trade rate
    const f0 = s.tradesUpTo(c.t - 60e9);
    this.setTitle(`${n} trades │ ${((n - f0) / 60).toFixed(1)}/s`);
  }

  renderLive(trades: Array<{ time: number; price: number; qty: number; side: "BUY" | "SELL"; cpty?: string }>, totalTrades: number = trades.length): void {
    if (!trades || trades.length === 0) {
      this.content.innerHTML = `<div class="blotter-empty"><span class="amber">AWAITING MARKET MATCH EXECUTIONS...</span></div>`;
      return;
    }

    const key = `${trades.length}|${trades[0]?.time ?? 0}|${trades[0]?.price ?? 0}|${trades[0]?.cpty ?? ""}|${this.cols}|${this.rows}`;
    if (!this.changed(key)) return;

    const rows = this.rows;
    const out: string[] = [];

    const displayTrades = trades.slice(0, rows);
    for (const t of displayTrades) {
      const cls = t.side === "BUY" ? "bid" : "ask";
      const sideStr = t.side === "BUY" ? "BUY " : "SELL";
      
      const d = new Date(t.time * 1000);
      const ms = String(Math.floor(d.getMilliseconds())).padStart(3, "0");
      const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}.${ms}`;

      const pxStr = fmtSmartPrice(t.price);
      const qtyStr = fmtSmartQty(t.qty);
      const cptyStr = (t.cpty || "JPM").padStart(5);
      const notional = t.price * t.qty;
      const notionalStr = "$" + (notional > 1000 ? (notional / 1000).toFixed(1) + "k" : notional.toFixed(0));

      const line =
        sp("d", lj(timeStr, 12)) +
        " " +
        sp(cls, rj(pxStr, 10)) +
        " " +
        sp("w", rj(qtyStr, 8)) +
        " " +
        sp(cls, lj(sideStr, 4)) +
        " " +
        sp("ours", lj(cptyStr.trim(), 5)) +
        " " +
        sp("d", rj(notionalStr, 7));

      out.push(line);
    }
    this.content.innerHTML = out.join("\n");

    this.setTitle(`${trades.length} trades | LIVE`);
  }
}
