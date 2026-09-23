import { CH, CW, el, esc } from "../dom";
import type { Session } from "../session";

export interface RenderCtx {
  t: number; // session time, ns
  f: number; // frame index
  playing: boolean;
  speed: number;
}

export abstract class Panel {
  static onTileFocusRequest?: (num: number) => void;

  readonly el: HTMLElement;
  readonly titleEl: HTMLElement;
  readonly body: HTMLElement;
  /** Inner content wrapper. Panels write here; body flex-centers this in focus mode. */
  protected readonly content: HTMLElement;
  private lastKey = "";

  constructor(
    readonly key: string,
    readonly num: number,
    readonly name: string,
    protected readonly s: Session,
  ) {
    this.el = el("section", "panel");
    this.el.dataset.panel = key;
    this.el.style.gridArea = key;
    this.titleEl = el("div", "title", this.el);
    this.body = el("div", "body", this.el);
    this.content = el("div", "content", this.body);

    this.titleEl.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains("n") || target === this.titleEl) {
        Panel.onTileFocusRequest?.(this.num);
      }
    });

    this.setTitle("");
  }

  setTitle(right: string): void {
    this.titleEl.innerHTML = `<span class="n">${this.num}</span> ${esc(this.name)}<span class="right">${esc(right)}</span>`;
  }

  get exactWidth(): number {
    const cs = getComputedStyle(this.body);
    return this.body.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
  }
  get exactHeight(): number {
    const cs = getComputedStyle(this.body);
    return this.body.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
  }

  /** Available rows / columns of the body in character cells. */
  get rows(): number {
    return Math.max(1, Math.floor(this.exactHeight / CH));
  }
  get cols(): number {
    return Math.max(1, Math.floor(this.exactWidth / CW));
  }

  /** Skip DOM rebuilds when nothing relevant changed. */
  protected changed(key: string): boolean {
    if (key === this.lastKey) return false;
    this.lastKey = key;
    return true;
  }

  invalidate(): void {
    this.lastKey = "";
  }

  abstract render(c: RenderCtx): void;
}
