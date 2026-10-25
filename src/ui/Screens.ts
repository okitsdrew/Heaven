import { cfg } from '../config';
import { clearLayout, Layout, loadLayout, persist, profile, saveLayout } from '../save';
import {
  buy,
  canBuy,
  isVisible,
  level,
  maxLevel,
  nextCost,
  nodeById,
  nodes,
  SkillNode,
  skills,
  unlockSkill,
} from '../skills';
import { xpToNext } from '../xp';

export interface RunSummary {
  title: string;
  kills: number;
  gold: number;
  xp: number;
  levelsGained: number;
  time: number;
}

const css = `
.screen { position: fixed; inset: 0; z-index: 8; background: rgba(8, 6, 14, 0.94); color: #d9d2e9;
  font: 14px/1.4 monospace; display: none; user-select: none; -webkit-user-select: none; }
.screen.open { display: block; }
.screen button { background: #2a2538; color: #e9e3f5; border: 1px solid #5a4f7c; font: inherit; padding: 8px 16px;
  cursor: pointer; }
.screen button:hover { background: #3d3558; }
.screen button.big { font-size: 18px; padding: 12px 28px; border-color: #c9b6ff; }
.screen button.go { background: #4a2f7a; border-color: #d9c8ff; }
#summary { display: none; place-items: center; }
#summary.open { display: grid; }
#summary .card { background: #14111d; border: 1px solid #5a4f7c; padding: 28px 40px; min-width: 300px; text-align: center; }
#summary h1 { margin: 0 0 16px; color: #f2d7a6; font-size: 26px; letter-spacing: 2px; }
#summary .stat { display: flex; justify-content: space-between; gap: 40px; margin: 6px 0; font-size: 16px; }
#summary .stat b { color: #f2d7a6; }
#summary .buttons { display: flex; gap: 12px; justify-content: center; margin-top: 24px; }
#tree .stage { position: absolute; inset: 0; overflow: hidden; touch-action: none; cursor: grab; }
#tree .stage.panning { cursor: grabbing; }
#tree .world { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
#tree svg { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
#tree line { stroke: #4a4166; stroke-width: 3; }
#tree line.on { stroke: #c9b6ff; }
#tree .node { position: absolute; width: 132px; padding: 6px 8px; box-sizing: border-box; text-align: center;
  background: #1b1628; border: 2px solid #4a4166; border-radius: 10px; cursor: pointer; touch-action: none; }
#tree .node.canbuy { border-color: #c9b6ff; }
#tree .node.owned { background: #2a2145; border-color: #9a7fe0; }
#tree .node.maxed { border-color: #f2d7a6; box-shadow: 0 0 12px rgba(242, 215, 166, 0.45); }
#tree .node.dragging { opacity: 0.85; border-style: dashed; z-index: 2; }
#tree .node.dim { opacity: 0.45; }
#tree .node .name { color: #f2d7a6; font-weight: bold; font-size: 13px; }
#tree .node .desc { color: #a79fc0; font-size: 11px; }
#tree .node .lvl { font-size: 12px; margin-top: 2px; }
#tree .node .cost { font-size: 11px; color: #9fe0a0; }
#tree .top { position: absolute; top: 0; left: 0; right: 0; display: flex; gap: 20px; align-items: center;
  padding: 10px 16px; background: rgba(10, 8, 16, 0.8); border-bottom: 1px solid #2a2538; z-index: 3; flex-wrap: wrap; }
#tree .top b { color: #f2d7a6; }
#tree .xpbar { width: 120px; height: 8px; background: #2a2538; display: inline-block; vertical-align: middle; }
#tree .xpbar i { display: block; height: 100%; background: #b070ff; }
#tree .tools { margin-left: auto; display: flex; gap: 8px; align-items: center; }
#tree .tools button { padding: 3px 8px; font-size: 12px; }
#tree .bottom { position: absolute; right: 16px; bottom: 16px; display: flex; gap: 12px; z-index: 3; }
#tree .hint { position: absolute; left: 16px; bottom: 16px; color: #6f6788; font-size: 11px; z-index: 3; }
#tree .skillspage { position: absolute; inset: 52px 0 70px; display: none; overflow-y: auto; padding: 24px;
  z-index: 2; background: rgba(8, 6, 14, 0.96); }
#tree.skillsview .skillspage { display: flex; gap: 16px; flex-wrap: wrap; align-content: flex-start; justify-content: center; }
#tree.skillsview .stage { visibility: hidden; }
.skillcard { width: 260px; background: #14111d; border: 2px solid var(--c); padding: 16px; display: flex;
  flex-direction: column; gap: 8px; }
.skillcard h2 { margin: 0; color: var(--c); font-size: 18px; }
.skillcard .req { color: #8a83a0; font-size: 11px; }
.skillcard.unlocked { box-shadow: 0 0 14px var(--c); }
`;

export class Screens {
  private summary: HTMLDivElement;
  private tree: HTMLDivElement;
  private stage: HTMLDivElement;
  private world: HTMLDivElement;
  private lines: SVGSVGElement;
  private topInfo: HTMLDivElement;
  private skillsPage: HTMLDivElement;
  private skillsBtn: HTMLButtonElement;
  private els = new Map<string, HTMLDivElement>();
  private layout: Layout = loadLayout();
  private view = { x: 0, y: 0, scale: 1 };
  private viewReady = false;
  private onBattle: () => void = () => {};

  constructor() {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    this.summary = this.div('screen', 'summary');
    this.tree = this.div('screen', 'tree');
    this.stage = this.div('stage', undefined, this.tree);
    this.world = this.div('world', undefined, this.stage);
    this.lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.world.appendChild(this.lines);
    this.topInfo = this.div('top', undefined, this.tree);
    this.skillsPage = this.div('skillspage', undefined, this.tree);

    for (const n of nodes) this.els.set(n.id, this.makeNode(n));

    const bottom = this.div('bottom', undefined, this.tree);
    this.skillsBtn = this.button('Skills', () => this.toggleSkills(), 'big');
    bottom.append(this.skillsBtn, this.button('Battle', () => this.onBattle(), 'big go'));
    this.div('hint', undefined, this.tree).textContent =
      'Drag background to pan, wheel to zoom, drag a node to move it, click a node to buy.';

    for (const el of [this.summary, this.tree]) {
      el.addEventListener('click', (e) => {
        if (e.target instanceof HTMLButtonElement) e.target.blur();
      });
    }
    this.bindStage();
  }

  get open(): boolean {
    return this.summary.classList.contains('open') || this.tree.classList.contains('open');
  }

  hide(): void {
    this.summary.classList.remove('open');
    this.tree.classList.remove('open');
  }

  showSummary(s: RunSummary, onRestart: () => void, onTree: () => void): void {
    this.hide();
    const mins = Math.floor(s.time / 60);
    const secs = Math.floor(s.time % 60);
    this.summary.innerHTML = '';
    const card = this.div('card', undefined, this.summary);
    const title = document.createElement('h1');
    title.textContent = s.title;
    card.appendChild(title);
    const rows: [string, string][] = [
      ['Enemies killed', String(s.kills)],
      ['Gold collected', String(s.gold)],
      ['XP gained', s.levelsGained > 0 ? `${s.xp} (+${s.levelsGained} level${s.levelsGained > 1 ? 's' : ''}!)` : String(s.xp)],
      ['Time survived', `${mins}:${String(secs).padStart(2, '0')}`],
    ];
    for (const [k, v] of rows) {
      const row = this.div('stat', undefined, card);
      row.innerHTML = `<span>${k}</span><b>${v}</b>`;
    }
    const buttons = this.div('buttons', undefined, card);
    buttons.append(this.button('Restart', onRestart, 'big go'), this.button('Skill Tree', onTree, 'big'));
    this.summary.classList.add('open');
  }

  showTree(onBattle: () => void): void {
    this.hide();
    this.onBattle = onBattle;
    this.tree.classList.remove('skillsview');
    this.skillsBtn.textContent = 'Skills';
    this.tree.classList.add('open');
    if (!this.viewReady) {
      this.view = { x: window.innerWidth / 2, y: window.innerHeight / 2, scale: 0.9 };
      this.viewReady = true;
    }
    this.refresh();
  }

  private toggleSkills(): void {
    const on = !this.tree.classList.contains('skillsview');
    this.tree.classList.toggle('skillsview', on);
    this.skillsBtn.textContent = on ? 'Skill Tree' : 'Skills';
    this.refresh();
  }

  private position(n: SkillNode): { x: number; y: number } {
    const saved = this.layout[n.id];
    if (saved) return saved;
    const a = (n.angle * Math.PI) / 180;
    return { x: Math.cos(a) * n.radius, y: Math.sin(a) * n.radius };
  }

  private makeNode(n: SkillNode): HTMLDivElement {
    const el = this.div('node', undefined, this.world);
    let start: { px: number; py: number; x: number; y: number } | null = null;
    let dragged = false;
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      const p = this.position(n);
      start = { px: e.clientX, py: e.clientY, x: p.x, y: p.y };
      dragged = false;
    });
    el.addEventListener('pointermove', (e) => {
      if (!start) return;
      const dx = e.clientX - start.px;
      const dy = e.clientY - start.py;
      if (!dragged && Math.hypot(dx, dy) < 5) return;
      dragged = true;
      el.classList.add('dragging');
      this.layout[n.id] = { x: Math.round(start.x + dx / this.view.scale), y: Math.round(start.y + dy / this.view.scale) };
      this.layoutNodes();
    });
    const end = () => {
      if (!start) return;
      start = null;
      el.classList.remove('dragging');
      if (dragged) saveLayout(this.layout);
      else if (buy(n)) {
        persist();
        this.refresh();
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', () => {
      start = null;
      el.classList.remove('dragging');
    });
    return el;
  }

  private bindStage(): void {
    let pan: { px: number; py: number; x: number; y: number } | null = null;
    this.stage.addEventListener('pointerdown', (e) => {
      this.stage.setPointerCapture(e.pointerId);
      pan = { px: e.clientX, py: e.clientY, x: this.view.x, y: this.view.y };
      this.stage.classList.add('panning');
    });
    this.stage.addEventListener('pointermove', (e) => {
      if (!pan) return;
      this.view.x = pan.x + e.clientX - pan.px;
      this.view.y = pan.y + e.clientY - pan.py;
      this.applyView();
    });
    const stop = () => {
      pan = null;
      this.stage.classList.remove('panning');
    };
    this.stage.addEventListener('pointerup', stop);
    this.stage.addEventListener('pointercancel', stop);
    this.stage.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const next = Math.min(2.5, Math.max(0.25, this.view.scale * Math.exp(-e.deltaY * 0.0015)));
        const k = next / this.view.scale;
        this.view.x = e.clientX - (e.clientX - this.view.x) * k;
        this.view.y = e.clientY - (e.clientY - this.view.y) * k;
        this.view.scale = next;
        this.applyView();
      },
      { passive: false },
    );
  }

  private applyView(): void {
    this.world.style.transform = `translate(${this.view.x}px, ${this.view.y}px) scale(${this.view.scale})`;
  }

  private layoutNodes(): void {
    const ns = cfg.tree.nodeSize;
    for (const n of nodes) {
      const el = this.els.get(n.id);
      if (!el) continue;
      const p = this.position(n);
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      el.style.transform = `translate(-50%, -50%) scale(${ns})`;
    }
    this.lines.innerHTML = '';
    for (const n of nodes) {
      if (!isVisible(n)) continue;
      for (const parentId of n.parents) {
        const parent = nodeById.get(parentId);
        if (!parent || !isVisible(parent)) continue;
        const a = this.position(parent);
        const b = this.position(n);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(a.x));
        line.setAttribute('y1', String(a.y));
        line.setAttribute('x2', String(b.x));
        line.setAttribute('y2', String(b.y));
        if (level(n.id) > 0 || level(parentId) > 0) line.setAttribute('class', 'on');
        this.lines.appendChild(line);
      }
    }
  }

  private refresh(): void {
    this.applyView();
    this.renderTop();
    for (const n of nodes) {
      const el = this.els.get(n.id);
      if (!el) continue;
      const lvl = level(n.id);
      const max = maxLevel(n);
      const cost = nextCost(n);
      const per = n.effect ? cfg.upgrade[n.effect] : 0;
      el.style.display = isVisible(n) ? '' : 'none';
      const unlocked = n.parents.every((p) => level(p) >= 1);
      el.className = 'node' + (lvl > 0 ? ' owned' : '') + (lvl >= max ? ' maxed' : '') + (canBuy(n) ? ' canbuy' : '') + (unlocked ? '' : ' dim');
      const costText =
        cost === null ? 'MAX' : cfg.tree.free ? 'free' : `${cost} ${n.currency === 'gold' ? 'gold' : 'SP'}`;
      el.innerHTML = `<div class="name">${n.name}</div><div class="desc">${n.desc(per)}</div>` +
        `<div class="lvl">${lvl}/${max}</div><div class="cost">${costText}</div>`;
    }
    this.layoutNodes();
    this.renderSkills();
  }

  private renderTop(): void {
    const need = xpToNext(profile.level);
    const pct = Math.min(100, (profile.xp / need) * 100);
    this.topInfo.innerHTML = `<span>Gold <b>${profile.gold}</b></span><span>Skill points <b>${profile.skillPoints}</b></span>` +
      `<span>Level <b>${profile.level}</b> <span class="xpbar"><i style="width:${pct}%"></i></span> ${Math.floor(profile.xp)}/${need}</span>`;
    const tools = this.div('tools', undefined, this.topInfo);
    const reveal = this.button(cfg.tree.revealAll ? 'Hide locked nodes' : 'Show all nodes', () => {
      cfg.tree.revealAll = !cfg.tree.revealAll;
      this.refresh();
    });
    tools.append(
      reveal,
      this.button('Reset layout', () => {
        this.layout = {};
        clearLayout();
        this.refresh();
      }),
      this.button('Copy layout', () => {
        const text = JSON.stringify(this.currentLayout());
        navigator.clipboard?.writeText(text).catch(() => {});
        prompt('Layout JSON (copied if allowed)', text);
      }),
    );
  }

  private currentLayout(): Layout {
    const out: Layout = {};
    for (const n of nodes) out[n.id] = this.position(n);
    return out;
  }

  private renderSkills(): void {
    this.skillsPage.innerHTML = '';
    for (const s of skills) {
      const card = this.div('skillcard', undefined, this.skillsPage);
      card.style.setProperty('--c', s.color);
      const owned = !!profile.skills[s.id];
      card.classList.toggle('unlocked', owned);
      const title = document.createElement('h2');
      title.textContent = `${s.name} [${s.key}]`;
      const desc = document.createElement('div');
      desc.textContent = s.desc;
      const req = document.createElement('div');
      req.className = 'req';
      req.textContent = s.requires.length
        ? `Needs: ${s.requires.map((r) => nodeById.get(r)?.name ?? r).join(' + ')} (not enforced yet)`
        : 'No prerequisites';
      const cost = cfg.tree.free ? 'free' : `${s.cost} skill point`;
      const btn = this.button(owned ? 'Unlocked' : `Unlock (${cost})`, () => {
        if (unlockSkill(s)) {
          persist();
          this.refresh();
        }
      });
      btn.disabled = owned;
      card.append(title, desc, req, btn);
    }
  }

  private div(cls: string, id?: string, parent: HTMLElement = document.body): HTMLDivElement {
    const d = document.createElement('div');
    d.className = cls;
    if (id) d.id = id;
    parent.appendChild(d);
    return d;
  }

  private button(label: string, run: () => void, cls = ''): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = cls;
    b.addEventListener('click', run);
    return b;
  }
}
