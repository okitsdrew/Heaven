import { skillIconUrl } from '../art/skillIcons';

// Faint code-drawn emblems behind the big tree buttons.
const svg = (body: string) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>${body}</svg>`)}")`;
const eyeArt = svg("<path d='M3 32Q32 4 61 32Q32 60 3 32Z' fill='none' stroke='#c9b6ff' stroke-opacity='.45' stroke-width='3'/><circle cx='32' cy='32' r='12' fill='#ff2a2a' fill-opacity='.5'/><circle cx='32' cy='32' r='5' fill='#000'/>");
const skullArt = svg("<path d='M32 5C17 5 9 16 9 28c0 8 4 12 9 15v10h28V43c5-3 9-7 9-15C55 16 47 5 32 5Z' fill='#f0d8d0' fill-opacity='.6'/><circle cx='22' cy='30' r='7' fill='#000' fill-opacity='.6'/><circle cx='42' cy='30' r='7' fill='#000' fill-opacity='.6'/><path d='M32 36l-4 8h8Z' fill='#000' fill-opacity='.6'/>");
const wash = (rgb: string) => `linear-gradient(rgba(${rgb}, 0.4), rgba(${rgb}, 0.4))`;
import { sfx } from '../audio';
import { cfg } from '../config';
import { persist, profile } from '../save';
import {
  bind,
  buy,
  alertFor,
  fireAlert,
  markSeen,
  warpAlert,
  canBuy,
  isSkill,
  isVisible,
  level,
  maxLevel,
  nextCost,
  refund,
  sandboxed,
  nodeById,
  nodes,
  SkillId,
  SkillNode,
  slotKeys,
  stage2Nodes,
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
.screen button:disabled { opacity: 0.3; cursor: not-allowed; }
.screen button.flash { animation: flash 0.9s ease-in-out infinite alternate; }
@keyframes flash { from { box-shadow: 0 0 4px #c9b6ff; background: #2a2145; } to { box-shadow: 0 0 22px #e0d0ff; background: #5a3a96; } }
.tip-above { position: absolute; left: 50%; bottom: calc(100% + 6px); transform: translateX(-50%); white-space: nowrap; font-size: 12px; color: #e0d0ff; pointer-events: none; }
.screen button.huge { font-size: 27px; padding: 18px 42px; }
.screen button.art { display: flex; align-items: flex-end; justify-content: center; min-height: 96px; padding-bottom: 8px; background-repeat: no-repeat; background-position: center 35%; background-size: auto 62%; text-shadow: 0 0 6px #000, 0 0 3px #000; }
.screen button.home { background-color: #000; border-color: #6d6a7a; }
.screen button.battle { background-color: #4a0a10; border-color: #d04848; }
.screen button.skillsbtn { background-color: #16337a; border-color: #86b6ff; }
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
#tree .node.dragging { opacity: 0.85; border-style: dashed; z-index: 2; }
#tree .node { position: absolute; width: 132px; padding: 6px 8px; box-sizing: border-box; text-align: center;
  background: #1b1628; border: 2px solid #4a4166; border-radius: 10px; cursor: pointer; touch-action: none; }
#tree .node.canbuy { border-color: #b8f0b8; box-shadow: 0 0 10px rgba(184, 240, 184, 0.35); background: #1f3324; }
#tree .node.owned { background: #2a2145; border-color: #9a7fe0; }
#tree .node.skill.canbuy { box-shadow: none; }
#tree .node.partial.canbuy { border-color: #b8f0b8; box-shadow: 0 0 10px rgba(184, 240, 184, 0.35); }
#tree .node.maxed { border-color: #ffd24a; box-shadow: 0 0 16px rgba(255, 210, 74, 0.65); }
#tree .node.deny { animation: deny 0.6s ease-out; }
@keyframes deny { 0%, 40% { border-color: #ff3030; box-shadow: 0 0 16px #ff3030; } 100% { box-shadow: none; } }
#tree .node.fadein, #tree line.fadein { animation: fadein 1.8s ease-out 0.5s both; }
@keyframes fadein { from { opacity: 0; } to { opacity: 1; } }
#tree .node.dim { filter: brightness(0.55); }
#tree .node.fresh { filter: saturate(0.55) brightness(0.85); }
#tree .node.fresh .name { color: #b8ad98; }
#tree .node.dim.fresh { filter: saturate(0.4) brightness(0.55); }
#tree .node.partial .lvl { color: #ffd98a; font-weight: bold; }
#tree .node.maxed .name { color: #ffe27a; }
#tree .node.maxed .cost { color: #ffd24a; font-weight: bold; }
#tree .node .pips { display: flex; gap: 4px; justify-content: center; margin-top: 4px; }
#tree .node .pips i { width: 14px; height: 6px; border: 1px solid rgba(255,255,255,0.45); background: rgba(0,0,0,0.4); display: block; }
#tree .node .pips i.on { background: #ffd98a; border-color: #ffd98a; box-shadow: 0 0 6px rgba(255, 217, 138, 0.7); }
#tree .node.maxed .pips i.on { background: #ffd24a; border-color: #fff0b0; }
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
div.tipring { position: fixed; z-index: 9; border: 3px dotted #e0d0ff; border-radius: 14px; pointer-events: none; }
div.traintip.big { width: 520px; padding: 22px 26px; font-size: 28px; }
div.traintip { position: fixed; z-index: 9; transform: translateX(-50%); width: 260px; padding: 10px 14px; text-align: center; background: #2a2145; border: 1px solid #c9b6ff;
  color: #e9e3f5; font: 16px/1.3 monospace; cursor: pointer; }
svg.trainline { position: fixed; inset: 0; width: 100%; height: 100%; z-index: 9; pointer-events: none; }
div.backbox { position: fixed; right: 16px; bottom: 16px; z-index: 7; display: flex; flex-direction: column; gap: 12px; align-items: stretch; }
button.back { background: #4a2f7a; color: #e9e3f5; border: 1px solid #d9c8ff;
  font: 27px/1.4 monospace; padding: 18px 42px; cursor: pointer; }
button.back:hover { background: #5d3c96; }
#tree .bottom { position: absolute; right: 16px; bottom: 16px; display: flex; gap: 12px; z-index: 3; }
#tree .node.skill { width: 300px; height: 128px; display: flex; flex-direction: column; justify-content: center; }
.ghost { position: fixed; z-index: 100; transform: translate(-50%, -50%); pointer-events: none; padding: 12px 22px; border: 3px solid #fff;
  font: bold 14px monospace; color: #f2d7a6; white-space: nowrap; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.6); }
#tree .tip { position: absolute; left: 50%; top: 72%; transform: translateX(-50%); z-index: 6; pointer-events: none; white-space: nowrap;
  font: italic 28px Georgia, serif; color: #e8f0ff; text-shadow: 0 0 12px #a8c4ff; }
#tree .tip span { display: inline-block; }
#tree .slot .box { touch-action: none; }
#tree .node small { display: block; margin-top: 4px; color: #8d85a8; font-size: 10px; }
#tree .node.selected { outline: 3px solid #ffffff; outline-offset: 3px; }
#tree .node.pickable { animation: pick 0.9s ease-in-out infinite alternate; }
@keyframes pick { from { outline: 2px solid rgba(255,255,255,0.1); outline-offset: 3px; } to { outline: 2px solid rgba(255,255,255,0.8); outline-offset: 3px; } }
.bang { position: absolute; top: -12px; right: -8px; width: 22px; height: 22px; border-radius: 50%; background: #e02a2a; color: #fff;
  font: bold 16px/22px monospace; text-align: center; pointer-events: none; box-shadow: 0 0 8px #ff4040; z-index: 5; }
.screen button { position: relative; }
.screen button .bang { top: -10px; right: -10px; }
#tree .selector { position: absolute; left: 16px; bottom: 56px; display: flex; z-index: 3; }
#tree .slot { width: 132px; text-align: center; }
#tree .slot .key { font-size: 24px; color: #e9e3f5; margin-top: 4px; }
#tree .slot .box img { height: 100%; image-rendering: auto; pointer-events: none; }
#tree .slot .box { height: 84px; border: 3px solid #cfc8e0; margin-left: -3px; display: flex; align-items: center; justify-content: center;
  padding: 4px; box-sizing: border-box; font-size: 12px; font-weight: bold; color: #f2d7a6; background: #14111c; cursor: pointer; }
#tree .slot:first-child .box { margin-left: 0; }
#tree .slot.sel .box { outline: 3px solid #ffffff; outline-offset: 2px; z-index: 1; position: relative; }
#tree .slot.target .box { animation: pick 0.9s ease-in-out infinite alternate; }
#tree .skills { position: fixed; top: 64px; right: 16px; z-index: 4; }
#tree .hint { position: absolute; left: 16px; bottom: 16px; color: #6f6788; font-size: 11px; z-index: 3; }
`;

type Mode = 'main' | 'book';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const rgba = (c: number, a: number) => `rgba(${(c >> 16) & 255}, ${(c >> 8) & 255}, ${c & 255}, ${a})`;

export class Screens {
  private static inst: Screens | null = null;

  // One set of DOM overlays serves every scene.
  static get(): Screens {
    return (Screens.inst ??= new Screens());
  }

  private summary: HTMLDivElement;
  private tree: HTMLDivElement;
  private stage: HTMLDivElement;
  private world: HTMLDivElement;
  private lines: SVGSVGElement;
  private topInfo: HTMLDivElement;
  private els = new Map<string, HTMLDivElement>();
  private mode: Mode = 'main';
  private views: Record<Mode, { x: number; y: number; scale: number } | null> = { main: null, book: null };
  private view = { x: 0, y: 0, scale: 1 };
  private bottom: HTMLDivElement;
  private opened = false;
  private back: HTMLDivElement | null = null;
  private tip: Element[] = [];
  private tipOff: (() => void) | null = null;
  // Skill enhancements waiting to fade onto the book, and which reveal is current.
  private held = new Set<string>();
  private reveal = 0;
  private selector: HTMLDivElement;
  // Skills that have just been revealed and fade in on the book this once.
  private fadeIds = new Set<string>();
  private selSkill: SkillId | null = null;
  private selSlot: number | null = null;
  private lastSlotClick = { i: -1, t: 0 };

  private constructor() {
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

    for (const n of nodes) this.els.set(n.id, this.makeNode(n));

    this.selector = this.div('selector', undefined, this.tree);
    this.bottom = this.div('bottom', undefined, this.tree);
    this.div('hint', undefined, this.tree).textContent =
      'Drag background to pan, wheel to zoom, click a node to buy, right-click to refund.';

    for (const el of [this.summary, this.tree]) {
      el.addEventListener('click', (e) => {
        if (e.target instanceof HTMLButtonElement) e.target.blur();
      });
    }
    this.bindStage();
    // Dev menu tweaks (such as Show lines) apply to an open tree straight away.
    const live = () => {
      if (this.tree.classList.contains('open')) this.refresh();
    };
    document.addEventListener('change', live);
    document.addEventListener('input', live);
  }

  get open(): boolean {
    return this.summary.classList.contains('open') || this.tree.classList.contains('open');
  }

  // In the testing grounds a big button over the game leads back to the tree.
  setTrainingButtons(run: { skills: () => void; home: () => void } | null): void {
    this.back?.remove();
    this.back = null;
    if (!run) return;
    const box = document.createElement('div');
    box.className = 'backbox';
    for (const [label, fn] of [['Home', run.home], ['Change Skills', run.skills]] as const) {
      const b = this.button(label, fn, 'back');
      // Keep keyboard focus off it so Space (dash) never presses it.
      b.tabIndex = -1;
      b.addEventListener('click', () => b.blur());
      box.appendChild(b);
    }
    document.body.appendChild(box);
    this.back = box;
  }

  // Once the other skills have faded in: a note and a dotted line pointing at the Testing Grounds button.
  // A big note in the middle of the screen. A click anywhere clears it, then `next` runs.
  private bigTip(text: string, next?: () => void): HTMLDivElement {
    this.clearTip();
    const box = this.div('traintip big', undefined, document.body);
    box.textContent = text;
    box.style.left = '50%';
    box.style.top = '50%';
    box.style.transform = 'translate(-50%, -50%)';
    this.tip = [box];
    const off = () => document.removeEventListener('pointerdown', onClick, true);
    const onClick = () => {
      this.clearTip();
      next?.();
    };
    document.addEventListener('pointerdown', onClick, true);
    this.tipOff = off;
    return box;
  }

  private showRefundTip(): void {
    if (!this.tree.classList.contains('open') || this.mode !== 'book') return;
    this.bigTip('Right-Click to refund a skill/upgrade', () => this.showTrainingTip());
  }

  private showTrainingTip(): void {
    const target = this.bottom.querySelector<HTMLElement>('.trainbtn');
    if (!target || !this.tree.classList.contains('open')) return;
    const r = target.getBoundingClientRect();
    const box = this.bigTip('Try out new skills at the Training grounds');
    const b = box.getBoundingClientRect();
    this.tip.push(this.dottedLine(b.left + b.width / 2, b.bottom + 6, r.left + r.width / 2, r.top - 8));
  }

  // The same note for the main tree, pointing at the Skills button the first time Fire Wave is affordable.
  private showFireTip(): void {
    const target = this.tree.querySelector<HTMLElement>('button.skills');
    if (!target || !this.tree.classList.contains('open') || this.mode !== 'main') return;
    const r = target.getBoundingClientRect();
    const box = this.bigTip('you can afford your first offensive skill!');
    const b = box.getBoundingClientRect();
    const ring = this.div('tipring', undefined, document.body);
    ring.style.cssText = `left:${r.left - 8}px;top:${r.top - 8}px;width:${r.width + 16}px;height:${r.height + 16}px`;
    this.tip.push(ring, this.dottedLine(b.left + b.width * 0.85, b.top - 6, r.left + r.width / 2, r.bottom + 12));
  }

  private dottedLine(x1: number, y1: number, x2: number, y2: number): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'trainline');
    const a = Math.atan2(y2 - y1, x2 - x1);
    const head = (d: number) => `${x2 - 14 * Math.cos(a + d)},${y2 - 14 * Math.sin(a + d)}`;
    svg.innerHTML =
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#e0d0ff" stroke-width="3" stroke-dasharray="3 9" stroke-linecap="round"/>` +
      `<polyline points="${head(-0.5)} ${x2},${y2} ${head(0.5)}" fill="none" stroke="#e0d0ff" stroke-width="3" stroke-linecap="round"/>`;
    document.body.appendChild(svg);
    return svg;
  }

  private revealEnhancements(): void {
    const run = ++this.reveal;
    const live = () => this.reveal === run && this.tree.classList.contains('open') && this.mode === 'book';
    window.setTimeout(() => {
      if (!live()) return;
      const ids = [...this.held];
      this.held.clear();
      this.zoomToFit('book');
      this.world.style.transition = 'transform 1.6s ease-in-out';
      this.held = new Set(ids);
      this.applyView();
      window.setTimeout(() => {
        if (!live()) return;
        this.world.style.transition = '';
        this.fadeIds = new Set(ids);
        this.held.clear();
        this.refresh();
        window.setTimeout(() => {
          this.fadeIds.clear();
          if (live()) this.refresh();
        }, 3500);
      }, 1800);
    }, 2500);
  }

  private clearTip(): void {
    this.tipOff?.();
    this.tipOff = null;
    for (const e of this.tip) e.remove();
    this.tip = [];
  }

  hide(): void {
    this.clearTip();
    this.held.clear();
    this.reveal++;
    this.world.style.transition = '';
    this.summary.classList.remove('open');
    this.tree.classList.remove('open');
  }

  showSummary(s: RunSummary, onRestart: () => void, onTree: () => void, onHome: () => void): void {
    if (!this.open) sfx.play('menuOpen');
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
      ['Souls collected', String(s.gold)],
      ['XP gained', s.levelsGained > 0 ? `${s.xp} (+${s.levelsGained} level${s.levelsGained > 1 ? 's' : ''}!)` : String(s.xp)],
      ['Time survived', `${mins}:${String(secs).padStart(2, '0')}`],
    ];
    for (const [k, v] of rows) {
      const row = this.div('stat', undefined, card);
      row.innerHTML = `<span>${k}</span><b>${v}</b>`;
    }
    const buttons = this.div('buttons', undefined, card);
    // The first time they hold souls here, only the upgrade tree works so they spend them instead of restarting weak.
    const nudge = profile.gold >= 1 && !profile.treeTutorialDone;
    const restart = this.button('Restart', onRestart, 'big go');
    const home = this.button('Home', onHome, 'big');
    const tree = this.treeButton(onTree);
    if (nudge) {
      restart.disabled = true;
      home.disabled = true;
      tree.classList.add('flash');
      const tip = document.createElement('span');
      tip.className = 'tip-above';
      tip.textContent = 'enter the upgrade tree';
      tree.appendChild(tip);
    }
    buttons.append(restart, tree, home);
    this.summary.classList.add('open');
  }

  showTree(onBattle: () => void, onHome: () => void, onTraining?: () => void): void {
    this.openMode('main');
    profile.treeTutorialDone = true;
    persist();
    const home = this.button('Home', onHome, 'big huge art home');
    home.style.backgroundImage = eyeArt;
    const battle = this.button('Battle', onBattle, 'big huge art battle');
    battle.style.backgroundImage = `${wash('74, 10, 16')}, ${skullArt}`;
    this.bottom.replaceChildren(home, battle);
    // Once the book is unlocked, a big button up here opens its skills and Close comes back to the tree.
    if (profile.bookUnlocked) {
      const skills = this.button('Skills', () => this.showBook(() => this.showTree(onBattle, onHome, onTraining), onTraining), 'big huge skills art skillsbtn');
      const aegis = skillIconUrl('aegis');
      if (aegis) skills.style.backgroundImage = `${wash('22, 51, 122')}, url(${aegis})`;
      if (fireAlert()) this.addBang(skills);
      if (fireAlert()) requestAnimationFrame(() => this.showFireTip());
      this.bottom.appendChild(skills);
    }
  }

  // The book holds the skills; it opens over whatever scene is behind it.
  showBook(onClose: () => void, onTraining?: () => void, closeLabel = 'Close', enhancementReveal = false): void {
    this.openMode('book');
    // The skills show first; then the view pulls back and the enhancements fade on around them.
    if (enhancementReveal) {
      for (const n of nodes) if (n.tree === 'book' && n.parents.some((p) => isSkill(p))) this.held.add(n.id);
      this.refresh();
      this.revealEnhancements();
    }
    this.bottom.replaceChildren(this.button(closeLabel, onClose, 'big huge go'));
    if (onTraining && profile.skillsRevealed) this.bottom.prepend(this.button('Testing Grounds', onTraining, 'big huge trainbtn'));
  }

  private openMode(mode: Mode): void {
    sfx.play(mode === 'book' ? 'bookOpen' : 'menuOpen');
    this.hide();
    this.selSkill = null;
    this.selSlot = null;
    if (this.opened) this.views[this.mode] = this.view;
    this.opened = true;
    this.mode = mode;
    // Book layout was tuned at 1916x895; scale it so it looks the same on any screen.
    const fit = mode === 'book' ? Math.min(window.innerWidth / 1916, window.innerHeight / 895) : Math.min(window.innerWidth / 1280, window.innerHeight / 800);
    this.view = this.views[mode] ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 + (mode === 'book' ? 0 : 40) * fit, scale: (mode === 'book' ? 0.85 : 0.8) * fit };
    if (mode === 'book' && profile.skillsRevealed && !profile.skillsFaded) {
      profile.skillsFaded = true;
      persist();
      for (const n of nodes) if (n.requires && n.tree === 'book') this.fadeIds.add(n.id);
      window.setTimeout(() => {
        this.fadeIds.clear();
        if (this.tree.classList.contains('open')) this.refresh();
        this.showRefundTip();
      }, 3500);
    }
    // The first visit to the tree after stage 2 opens: its new upgrades fade in, with the view pulled back to show them all.
    if (mode === 'main' && profile.stage >= 2 && !profile.stage2TreeShown) {
      profile.stage2TreeShown = true;
      persist();
      for (const id of stage2Nodes) this.fadeIds.add(id);
      this.zoomToFit();
      window.setTimeout(() => {
        this.fadeIds.clear();
        if (this.tree.classList.contains('open')) this.refresh();
      }, 3500);
    }
    this.tree.classList.add('open');
    this.refresh();
  }

  // Pulls the view back so the whole visible tree fits on screen, centred, never closer than it already was.
  private zoomToFit(mode: Mode = 'main'): void {
    const ns = cfg.tree.nodeSize;
    const halfW = 70 * ns;
    const halfH = 80 * ns;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const n of nodes) {
      if ((n.tree ?? 'main') !== mode || !isVisible(n)) continue;
      const p = this.position(n);
      x0 = Math.min(x0, p.x - halfW);
      x1 = Math.max(x1, p.x + halfW);
      y0 = Math.min(y0, p.y - halfH);
      y1 = Math.max(y1, p.y + halfH);
    }
    if (!Number.isFinite(x0)) return;
    const top = 70;
    const bottom = 200;
    const availW = window.innerWidth - 60;
    const availH = window.innerHeight - top - bottom;
    const scale = Math.min(this.view.scale, availW / (x1 - x0), availH / (y1 - y0));
    this.view = {
      scale,
      x: window.innerWidth / 2 - ((x0 + x1) / 2) * scale,
      y: top + availH / 2 - ((y0 + y1) / 2) * scale,
    };
  }

  // Visible on the tree right now: unlocked, and not one of the upgrades still held back for their reveal.
  private vis(n: SkillNode): boolean {
    return isVisible(n) && !this.held.has(n.id);
  }

  private shown(): SkillNode[] {
    return nodes.filter((n) => (n.tree ?? 'main') === this.mode);
  }

  private skillLayout = loadSkillLayout();

  private position(n: SkillNode): { x: number; y: number } {
    return this.skillLayout[n.id] ?? { x: n.x, y: n.y };
  }

  private makeNode(n: SkillNode): HTMLDivElement {
    const el = this.div('node', undefined, this.world);
    // Double-clicking an owned skill equips it in the first open slot.
    el.addEventListener('dblclick', () => {
      if (!isSkill(n.id) || level(n.id) < 1 || profile.binds.includes(n.id)) return;
      const free = profile.binds.indexOf(null);
      if (free < 0) return;
      bind(n.id, free);
      sfx.play('equip');
      this.selSkill = null;
      this.selSlot = null;
      persist();
      this.refresh();
    });
    const alert = alertFor(n.id);
    if (alert) {
      el.addEventListener('pointerenter', () => {
        if (!alert()) return;
        markSeen(n.id);
        persist();
        document.querySelectorAll('.bang').forEach((b) => b.remove());
      });
    }
    let start: { px: number; py: number; x: number; y: number } | null = null;
    let ghost: HTMLDivElement | null = null;
    let moved = false;
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (refund(n)) {
        sfx.play('refund');
        persist();
        this.refresh();
      }
    });
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      el.setPointerCapture(e.pointerId);
      const p = this.position(n);
      start = { px: e.clientX, py: e.clientY, x: p.x, y: p.y };
      moved = false;
    });
    el.addEventListener('pointermove', (e) => {
      if (!start) return;
      // Skill move (dev): skill nodes slide around instead of being dragged into slots.
      if (cfg.debug.skillMove && isSkill(n.id)) {
        const dx = e.clientX - start.px;
        const dy = e.clientY - start.py;
        if (!moved && Math.hypot(dx, dy) < 5) return;
        moved = true;
        el.classList.add('dragging');
        this.skillLayout[n.id] = { x: Math.round(start.x + dx / this.view.scale), y: Math.round(start.y + dy / this.view.scale) };
        this.layoutNodes();
        return;
      }
      if (ghost) {
        this.moveGhost(ghost, e);
        return;
      }
      // An owned skill can be dragged out as a placeholder button; the node itself never moves.
      if (isSkill(n.id) && level(n.id) >= 1 && Math.hypot(e.clientX - start.px, e.clientY - start.py) >= 5) {
        ghost = this.makeGhost(n);
        this.moveGhost(ghost, e);
      }
    });
    const end = (e: PointerEvent) => {
      if (!start) return;
      start = null;
      el.classList.remove('dragging');
      if (moved) {
        moved = false;
        saveSkillLayout(this.skillLayout);
        return;
      }
      if (ghost) {
        ghost.remove();
        ghost = null;
        const slot = this.slotAt(e);
        if (slot !== null && isSkill(n.id)) {
          bind(n.id, slot);
          sfx.play('equip');
          persist();
          this.refresh();
        }
      } else if (isSkill(n.id) && level(n.id) >= 1) this.pickSkill(n.id);
      else if (!canBuy(n)) {
        if (this.vis(n) && nextCost(n) !== null) this.deny(el);
      } else if (buy(n)) {
        sfx.play('buy');
        persist();
        this.refresh();
        if (isSkill(n.id) && !profile.skillTipShown) {
          profile.skillTipShown = true;
          persist();
          this.ghostText('click a skill and assign it a slot', 2000);
        }
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', () => {
      start = null;
      ghost?.remove();
      ghost = null;
    });
    return el;
  }

  // The coloured button that follows the pointer while a skill is dragged.
  private makeGhost(n: SkillNode): HTMLDivElement {
    const g = this.div('ghost', undefined, document.body);
    const c = n.color ?? 0xffffff;
    g.textContent = n.name;
    g.style.borderColor = hex(c);
    g.style.background = `linear-gradient(rgba(0,0,0,0.5), ${rgba(c, 0.35)}), #14111c`;
    return g;
  }

  private moveGhost(g: HTMLDivElement, e: PointerEvent): void {
    g.style.left = `${e.clientX}px`;
    g.style.top = `${e.clientY}px`;
  }

  private slotAt(e: PointerEvent): number | null {
    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest('.slot');
    return hit instanceof HTMLElement && hit.dataset.i !== undefined ? Number(hit.dataset.i) : null;
  }

  // Text that hangs for a moment, then each letter is blown away.
  private ghostText(text: string, holdMs: number): void {
    const box = this.div('tip', undefined, this.tree);
    const letters = [...text].map((c) => {
      const sp = document.createElement('span');
      sp.textContent = c === ' ' ? '\u00a0' : c;
      box.appendChild(sp);
      return sp;
    });
    setTimeout(() => {
      letters.forEach((sp, i) => {
        sp.style.transition = `transform 1.4s cubic-bezier(.5,0,1,1) ${i * 20}ms, opacity 1.4s ease-in ${i * 20}ms`;
        sp.style.transform = `translate(${260 + Math.random() * 260}px, ${-30 - Math.random() * 90}px) rotate(${-30 + Math.random() * 90}deg) scale(1.8)`;
        sp.style.opacity = '0';
      });
      setTimeout(() => box.remove(), 2400);
    }, holdMs);
  }

  private bindStage(): void {
    let pan: { px: number; py: number; x: number; y: number } | null = null;
    this.stage.addEventListener('contextmenu', (e) => e.preventDefault());
    this.stage.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (this.selSkill || this.selSlot !== null) {
        this.selSkill = null;
        this.selSlot = null;
        this.refresh();
      }
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
    for (const n of this.shown()) {
      const el = this.els.get(n.id);
      if (!el) continue;
      const p = this.position(n);
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      el.style.transform = `translate(-50%, -50%) scale(${ns})`;
    }
    this.lines.innerHTML = '';
    if (!cfg.tree.showLines) return;
    for (const n of this.shown()) {
      if (!this.vis(n)) continue;
      for (const parentId of n.parents) {
        const parent = nodeById.get(parentId);
        if (!parent || !this.vis(parent)) continue;
        const a = this.position(parent);
        const b = this.position(n);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(a.x));
        line.setAttribute('y1', String(a.y));
        line.setAttribute('x2', String(b.x));
        line.setAttribute('y2', String(b.y));
        if (level(n.id) > 0 || level(parentId) > 0) line.classList.add('on');
        if (this.fadeIds.has(n.id)) line.classList.add('fadein');
        this.lines.appendChild(line);
      }
    }
  }

  // Click an owned skill, then a slot (or a slot, then a skill) to equip it there.
  private pickSkill(id: SkillId): void {
    if (this.selSlot !== null) {
      bind(id, this.selSlot);
      sfx.play('equip');
      this.selSlot = null;
      this.selSkill = null;
      persist();
    } else this.selSkill = this.selSkill === id ? null : id;
    this.refresh();
  }

  private pickSlot(i: number): void {
    if (this.selSkill) {
      bind(this.selSkill, i);
      sfx.play('equip');
      this.selSkill = null;
      this.selSlot = null;
      persist();
    } else this.selSlot = this.selSlot === i ? null : i;
    this.refresh();
  }

  private renderSelector(): void {
    this.selector.style.display = this.mode === 'book' || level('teleport') >= 1 ? 'flex' : 'none';
    this.selector.replaceChildren();
    slotKeys.forEach((key, i) => {
      const id = profile.binds[i];
      const node = id ? nodeById.get(id) : undefined;
      const slot = this.div('slot' + (this.selSlot === i ? ' sel' : '') + (this.selSkill ? ' target' : ''), undefined, this.selector);
      const box = this.div('box', undefined, slot);
      this.div('key', undefined, slot).textContent = key;
      if (node) {
        const c = hex(node.color ?? 0xffffff);
        const icon = skillIconUrl(node.id);
        if (icon) {
          const img = document.createElement('img');
          img.src = icon;
          img.draggable = false;
          box.appendChild(img);
          box.title = node.name;
        } else box.textContent = node.name;
        box.style.borderColor = c;
        box.style.background = `linear-gradient(rgba(0,0,0,0.5), ${rgba(node.color ?? 0xffffff, 0.3)}), #14111c`;
      }
      slot.dataset.i = String(i);
      const unequip = () => {
        profile.binds[i] = null;
        this.selSkill = null;
        this.selSlot = null;
        persist();
        this.refresh();
      };
      box.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        unequip();
      });
      // Press and release picks the slot; dragging a filled slot onto another one swaps them.
      let down: { x: number; y: number } | null = null;
      let ghost: HTMLDivElement | null = null;
      box.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        box.setPointerCapture(e.pointerId);
        down = { x: e.clientX, y: e.clientY };
      });
      box.addEventListener('pointermove', (e) => {
        if (!down) return;
        if (ghost) this.moveGhost(ghost, e);
        else if (node && !cfg.debug.skillMove && Math.hypot(e.clientX - down.x, e.clientY - down.y) >= 5) {
          ghost = this.makeGhost(node);
          this.moveGhost(ghost, e);
        }
      });
      box.addEventListener('pointerup', (e) => {
        if (!down) return;
        down = null;
        if (ghost) {
          ghost.remove();
          ghost = null;
          const to = this.slotAt(e);
          if (to !== null && to !== i && id && isSkill(id)) {
            bind(id, to);
            sfx.play('equip');
            persist();
            this.refresh();
          }
        } else if (this.lastSlotClick.i === i && performance.now() - this.lastSlotClick.t < 400) {
          // The selector is rebuilt on every click, so a double click is timed here rather than left to the browser.
          this.lastSlotClick = { i: -1, t: 0 };
          unequip();
        } else {
          this.lastSlotClick = { i, t: performance.now() };
          this.pickSlot(i);
        }
      });
      box.addEventListener('pointercancel', () => {
        down = null;
        ghost?.remove();
        ghost = null;
      });
    });
  }

  private refresh(): void {
    this.applyView();
    this.renderTop();
    this.renderSelector();
    for (const [id, el] of this.els) if ((nodeById.get(id)?.tree ?? 'main') !== this.mode) el.style.display = 'none';
    for (const n of this.shown()) {
      const el = this.els.get(n.id);
      if (!el) continue;
      const lvl = level(n.id);
      const max = maxLevel(n);
      const cost = nextCost(n);
      const per = n.effect ? cfg.upgrade[n.effect] : 0;
      el.style.display = this.vis(n) ? '' : 'none';
      const blocked = !!n.excludes?.some((id) => level(id) > 0);
      const unlocked = n.parents.every((p) => level(p) >= 1) && !blocked;
      const equippable = isSkill(n.id) && lvl >= 1;
      el.className =
        'node' + (n.tree === 'book' ? ' skill' : '') + (lvl > 0 ? ' owned' : canBuy(n) ? '' : ' fresh') + (lvl > 0 && lvl < max ? ' partial' : '') + (lvl >= max ? ' maxed' : '') + (canBuy(n) ? ' canbuy' : '') + (unlocked ? '' : ' dim') +
        (this.fadeIds.has(n.id) ? ' fadein' : '') + (this.selSkill === n.id ? ' selected' : '') + (equippable && this.selSlot !== null ? ' pickable' : '');
      if (n.color) {
        // Not bought: a faint outline. Partly bought: the skill's colour and a glow. Maxed: gold.
        const done = lvl >= max;
        el.style.borderColor = done ? '#ffd24a' : lvl > 0 ? hex(n.color) : rgba(n.color, 0.4);
        el.style.background = `linear-gradient(rgba(0,0,0,${lvl > 0 ? 0.55 : 0.7}), ${rgba(n.color, lvl > 0 ? 0.22 : 0.08)}), #14111c`;
        el.style.boxShadow = done ? '0 0 16px rgba(255, 210, 74, 0.65)' : lvl > 0 ? `0 0 12px ${rgba(n.color, 0.5)}` : '';
      }
      const costText =
        cost === null ? 'MAX' : blocked ? 'BLOCKED' : cfg.tree.free || sandboxed() ? 'free' : `${cost} ${n.currency === 'gold' ? 'souls' : 'SP'}`;
      const slot = isSkill(n.id) ? profile.binds.indexOf(n.id) : -1;
      el.innerHTML = `<div class="name">${n.name}</div><div class="desc">${n.desc(per)}</div>` +
        `<div class="lvl">${slot >= 0 ? `Equipped on ${slotKeys[slot]}` : `${lvl}/${max}`}</div><div class="cost">${costText}</div>` +
        (max > 1 ? `<div class="pips">${Array.from({ length: max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>` : '') +
        (alertFor(n.id)?.() ? '<span class="bang">!</span>' : '');
    }
    this.layoutNodes();
  }

  private renderTop(): void {
    const need = xpToNext(profile.level);
    const pct = Math.min(100, (profile.xp / need) * 100);
    this.topInfo.innerHTML = (this.mode === 'book' ? '<span><b>The Book</b></span>' : '') + `<span>Souls <b>${profile.gold}</b></span><span>Skill points <b>${profile.skillPoints}</b></span>` +
      `<span>Level <b>${profile.level}</b> <span class="xpbar"><i style="width:${pct}%"></i></span> ${Math.floor(profile.xp)}/${need}</span>`;
    const tools = this.div('tools', undefined, this.topInfo);
    const lines = this.button(cfg.tree.showLines ? 'Hide lines' : 'Show lines', () => {
      cfg.tree.showLines = !cfg.tree.showLines;
      this.refresh();
    });
    const reveal = this.button(cfg.tree.revealAll ? 'Hide locked nodes' : 'Show all nodes', () => {
      cfg.tree.revealAll = !cfg.tree.revealAll;
      this.refresh();
    });
    tools.append(
      reveal,
      lines
    );
  }

  private div(cls: string, id?: string, parent: HTMLElement = document.body): HTMLDivElement {
    const d = document.createElement('div');
    d.className = cls;
    if (id) d.id = id;
    parent.appendChild(d);
    return d;
  }

  // A red flash on a node the player cannot afford.
  private deny(el: HTMLElement): void {
    sfx.play('deny');
    el.classList.remove('deny');
    void el.offsetWidth;
    el.classList.add('deny');
    window.setTimeout(() => el.classList.remove('deny'), 600);
  }

  private treeButton(run: () => void): HTMLButtonElement {
    const b = this.button('Upgrade Tree', run, 'big');
    if (warpAlert()) this.addBang(b);
    return b;
  }

  private addBang(el: HTMLElement): void {
    const bang = document.createElement('span');
    bang.className = 'bang';
    bang.textContent = '!';
    el.appendChild(bang);
  }

  private button(label: string, run: () => void, cls = ''): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = cls;
    b.addEventListener('click', run);
    return b;
  }
}

// Bumped when the default skill positions are the ones to see, so old dev-menu drags are dropped (v1 held positions that overlapped).
const SKILL_LAYOUT_KEY = 'heaven.skillLayout.v2';

function loadSkillLayout(): Record<string, { x: number; y: number }> {
  try {
    return JSON.parse(localStorage.getItem(SKILL_LAYOUT_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function saveSkillLayout(l: Record<string, { x: number; y: number }>): void {
  try {
    localStorage.setItem(SKILL_LAYOUT_KEY, JSON.stringify(l));
  } catch {
    // Storage can be unavailable; the move still holds for this session.
  }
}
