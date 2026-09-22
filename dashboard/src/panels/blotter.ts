/**
 * StratumTCA Institutional Execution Blotter Panel
 * High-density audit trail of child order executions with individual TCA metrics.
 */

import { esc } from "../dom";
import { Panel, type RenderCtx } from "./base";
import type { Session } from "../session";
import type { TradeRecord } from "../tca_engine";

export class BlotterPanel extends Panel {
  private trades: TradeRecord[] = [];

  constructor(key: string, num: number, name: string, s: Session) {
    super(key, num, name, s);
    this.setTitle("INSTITUTIONAL TRADE BLOTTER");
  }

  setTrades(trades: TradeRecord[]) {
    this.trades = trades;
    this.renderView();
  }

  render(_c: RenderCtx): void {
    this.renderView();
  }

  private renderView() {
    const list = this.trades.slice(-50).reverse(); // latest 50 first

    if (list.length === 0) {
      this.body.innerHTML = `
        <div class="blotter-empty">
          <span class="amber">WAITING FOR EXECUTIONS...</span>
          <p>Orders resting at touch will register here with nanosecond TCA timestamps upon execution.</p>
        </div>
      `;
      return;
    }

    const rowsHtml = list
      .map((t) => {
        const sideCls = t.side === "BUY" ? "buy" : "sell";
        const isCls = t.implementationShortfallBps <= 0 ? "good" : "bad";
        const isSign = t.implementationShortfallBps <= 0 ? "" : "+";
        const m5Cls = t.markout5sBps >= 0 ? "good" : "bad";
        const m5Sign = t.markout5sBps >= 0 ? "+" : "";

        let gradeBadge = "badge-a";
        if (t.grade === "A+") gradeBadge = "badge-aplus";
        else if (t.grade === "B") gradeBadge = "badge-b";
        else if (t.grade === "C") gradeBadge = "badge-c";
        else if (t.grade === "F") gradeBadge = "badge-f";

        return `
        <tr>
          <td class="mono">${esc(t.timeStr)}</td>
          <td class="mono">#${t.id}</td>
          <td><span class="side-pill ${sideCls}">${t.side}</span></td>
          <td class="mono bold">${t.price.toFixed(2)}</td>
          <td class="mono">${t.qty.toFixed(3)}</td>
          <td class="mono">$${t.notional.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
          <td class="mono">${t.arrivalPrice.toFixed(2)}</td>
          <td class="mono ${isCls}">${isSign}${t.implementationShortfallBps.toFixed(2)}</td>
          <td class="mono">${t.queueWaitMs.toFixed(0)} ms</td>
          <td class="mono ${m5Cls}">${m5Sign}${t.markout5sBps.toFixed(2)}</td>
          <td><span class="grade-tag ${gradeBadge}">${t.grade}</span></td>
        </tr>
      `;
      })
      .join("");

    this.body.innerHTML = `
      <div class="blotter-container">
        <table class="blotter-table">
          <thead>
            <tr>
              <th>TIME</th>
              <th>ORDER ID</th>
              <th>SIDE</th>
              <th>FILL PRICE</th>
              <th>QTY</th>
              <th>NOTIONAL</th>
              <th>ARRIVAL</th>
              <th>IS (bps)</th>
              <th>QUEUE WAIT</th>
              <th>5s MARKOUT</th>
              <th>QUALITY</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  }
}
