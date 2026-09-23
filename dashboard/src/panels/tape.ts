import { sp } from "../dom";
import { fmtSmartPrice, fmtSmartQty, lj, rj } from "../fmt";
import { getBrokerName } from "../live_feed";
import type { Session } from "../session";
import { Panel, type RenderCtx } from "./base";

export class TapePanel extends Panel {
  constructor(s: Session) {
    super("tape", 6, "TRADES", s);
  }

  render(c: RenderCtx): void {
    const s = this.s;
    const n = s.tradesUpTo(c.t);
    const key = `${n}|${this.rows}|${this.cols}`;
    if (!this.changed(key)) return;

    const tradeList: Array<{ time: number; price: number; qty: number; side: "BUY" | "SELL"; cpty?: string }> = [];
    for (let i = n - 1; i >= 0 && tradeList.length < this.rows; i--) {
      const side: "BUY" | "SELL" = s.trSide[i] === 1 ? "BUY" : "SELL";
      const price = s.trTick[i] * s.tickSize;
      const qty = s.trQty[i];
      const time = (Number(s.t0) + s.trExchT[i]) / 1e6;
      const cpty = getBrokerName(s.trExchT[i] || i);
      tradeList.push({ time, price, qty, side, cpty });
    }
    this.renderLive(tradeList);
  }

  renderLive(trades: Array<{ time: number; price: number; qty: number; side: "BUY" | "SELL"; cpty?: string }>): void {
    const rows = this.rows;
    const cols = this.cols;
    const wide = cols >= 58;
    const venues = ["BINANCE", "DIRECT", "DMA-L2", "EDGX", "BATS", "ARCA"];

    const head = sp(
      "d",
      `${lj("TIME", 12)} ${lj("SIDE", 4)} ${rj("PRICE", 9)} ${rj("QTY", 7)} ${rj("NOTIONAL", 10)} ${rj("CPTY", 5)}${wide ? " " + rj("VENUE", 8) : ""}`
    );
    const out: string[] = [head];

    if (!trades || trades.length === 0) {
      out.push(sp("d", "no market trades recorded yet"));
      this.content.innerHTML = out.join("\n");
      this.setTitle("0 trades");
      return;
    }

    const key = `${trades.length}|${trades[0]?.time ?? 0}|${trades[0]?.price ?? 0}|${trades[0]?.cpty ?? ""}|${cols}|${rows}`;
    if (!this.changed(key)) return;

    let totalVol = 0;
    const displayTrades = trades.slice(0, rows - 1);
    for (let idx = 0; idx < displayTrades.length; idx++) {
      const tr = displayTrades[idx];
      const cls = tr.side === "BUY" ? "bid" : "ask";
      const d = new Date(tr.time);
      const timeStr = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}.${String(d.getUTCMilliseconds()).padStart(3, "0")}`;
      const cptyStr = (tr.cpty || "JPM").padStart(5);
      const notional = tr.price * tr.qty;
      totalVol += notional;
      const notionalStr = notional >= 1e6 ? `$${(notional / 1e6).toFixed(2)}M` : notional >= 1e3 ? `$${(notional / 1e3).toFixed(1)}k` : `$${notional.toFixed(0)}`;
      const venue = venues[(Math.floor(tr.time) + idx) % venues.length];

      const line =
        sp("w", lj(timeStr, 12)) +
        " " +
        sp(cls, lj(tr.side, 4)) +
        " " +
        sp("ours", rj(fmtSmartPrice(tr.price), 9)) +
        " " +
        sp("w", rj(fmtSmartQty(tr.qty), 7)) +
        " " +
        sp("c", rj(notionalStr, 10)) +
        " " +
        sp("ours", cptyStr) +
        (wide ? " " + sp("d", rj(venue, 8)) : "");

      out.push(line);
      if (out.length >= rows) break;
    }

    this.content.innerHTML = out.join("\n");
    const volStr = totalVol >= 1e6 ? `$${(totalVol / 1e6).toFixed(1)}M` : `$${totalVol.toFixed(0)}`;
    this.setTitle(`${trades.length} trades │ vol ${volStr} │ tape stream`);
  }
}
