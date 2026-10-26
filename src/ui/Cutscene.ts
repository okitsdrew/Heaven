import { cfg } from '../config';
import { controls, intro, StoryScene, tutorialTitle } from '../story';

const css = `
.cutscene { position: fixed; inset: 0; z-index: 9; display: none; place-items: center; color: #e9e3f5;
  font: 18px/1.6 monospace; user-select: none; -webkit-user-select: none; cursor: pointer; }
.cutscene.open { display: grid; }
.cutscene .bg { position: absolute; inset: 0; transition: background 1.2s; }
.cutscene .bg.dawn { background: radial-gradient(ellipse at 50% 85%, #6a4f7a 0%, #2a2140 45%, #0b0a10 100%); }
.cutscene .bg.void { background: radial-gradient(ellipse at 50% 60%, #1a1030 0%, #08060e 70%); }
.cutscene .bg.ember { background: radial-gradient(ellipse at 50% 100%, #8a3a10 0%, #2a1020 40%, #0b0a10 100%); }
.cutscene .text { position: relative; max-width: 640px; padding: 0 24px; text-align: center; min-height: 140px; }
.cutscene .text p { margin: 0 0 14px; opacity: 0; transition: opacity 0.6s; }
.cutscene .text p.in { opacity: 1; }
.cutscene h2 { margin: 0 0 18px; color: #f2d7a6; font-size: 22px; letter-spacing: 2px; }
.cutscene .keys { display: grid; grid-template-columns: auto 1fr; gap: 6px 22px; text-align: left; font-size: 15px; }
.cutscene .keys b { color: #f2d7a6; text-align: right; }
.cutscene .hint { position: absolute; bottom: 24px; left: 0; right: 0; text-align: center; color: #6f6788; font-size: 12px; }
.cutscene .skip { position: absolute; top: 14px; right: 16px; background: #2a2538; color: #e9e3f5; border: 1px solid #5a4f7c;
  font: 12px monospace; padding: 4px 10px; cursor: pointer; }
`;

// Full-screen DOM story player. Click, Space or Enter finishes the line being typed, then moves on.
export class Cutscene {
  private root: HTMLDivElement;
  private bg: HTMLDivElement;
  private text: HTMLDivElement;
  private done: () => void = () => {};
  private scene = 0;
  private line = 0;
  private typing: { el: HTMLElement; full: string; shown: number } | null = null;
  private timer = 0;
  private onKey = (e: KeyboardEvent) => {
    if (!this.root.classList.contains('open')) return;
    if (e.code === 'Escape') this.finish();
    else if (e.code === 'Space' || e.code === 'Enter') this.advance();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  constructor() {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    this.root = document.createElement('div');
    this.root.className = 'cutscene';
    this.bg = this.add('bg');
    this.text = this.add('text');
    this.add('hint').textContent = 'Click or Space to continue';
    const skip = document.createElement('button');
    skip.className = 'skip';
    skip.textContent = 'Skip';
    skip.onclick = (e) => {
      e.stopPropagation();
      this.finish();
    };
    this.root.append(skip);
    this.root.addEventListener('click', () => this.advance());
    document.body.appendChild(this.root);
    window.addEventListener('keydown', this.onKey, true);
  }

  get playing(): boolean {
    return this.root.classList.contains('open');
  }

  play(onDone: () => void): void {
    this.done = onDone;
    this.scene = 0;
    this.line = 0;
    this.root.classList.add('open');
    this.showScene();
  }

  private add(cls: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = cls;
    this.root.appendChild(el);
    return el;
  }

  private showScene(): void {
    this.text.innerHTML = '';
    this.line = 0;
    if (this.scene < intro.length) {
      const s: StoryScene = intro[this.scene];
      this.bg.className = `bg ${s.mood}`;
      this.nextLine();
    } else {
      this.bg.className = 'bg void';
      this.showControls();
    }
  }

  private nextLine(): void {
    const s = intro[this.scene];
    const p = document.createElement('p');
    this.text.appendChild(p);
    requestAnimationFrame(() => p.classList.add('in'));
    this.type(p, s.lines[this.line]);
  }

  private showControls(): void {
    const h = document.createElement('h2');
    h.textContent = tutorialTitle;
    const keys = document.createElement('div');
    keys.className = 'keys';
    for (const [k, v] of controls) {
      const b = document.createElement('b');
      b.textContent = k;
      const span = document.createElement('span');
      span.textContent = v;
      keys.append(b, span);
    }
    this.text.append(h, keys);
  }

  private type(el: HTMLElement, full: string): void {
    this.typing = { el, full, shown: 0 };
    el.textContent = '';
    clearInterval(this.timer);
    const step = () => {
      const t = this.typing;
      if (!t) return;
      t.shown = Math.min(t.full.length, t.shown + 1);
      t.el.textContent = t.full.slice(0, t.shown);
      if (t.shown >= t.full.length) this.stopTyping();
    };
    this.timer = window.setInterval(step, 1000 / Math.max(cfg.story.charsPerSecond, 1));
  }

  private stopTyping(): void {
    clearInterval(this.timer);
    if (this.typing) this.typing.el.textContent = this.typing.full;
    this.typing = null;
  }

  private advance(): void {
    if (this.typing) {
      this.stopTyping();
      return;
    }
    if (this.scene >= intro.length) {
      this.finish();
      return;
    }
    if (this.line + 1 < intro[this.scene].lines.length) {
      this.line++;
      this.nextLine();
      return;
    }
    this.scene++;
    this.showScene();
  }

  private finish(): void {
    this.stopTyping();
    this.root.classList.remove('open');
    this.done();
  }
}
