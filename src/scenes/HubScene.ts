import Phaser from 'phaser';
import { makePlaceholderArt, Tex } from '../art/placeholders';
import { cfg } from '../config';
import { DevMenu } from '../dev/DevMenu';
import { Fx } from '../game/Fx';
import { Player } from '../game/Player';
import { PlayerView } from '../game/PlayerView';
import { crayonLine, CrayonLine, CRAYON_FONT, preloadCrayonFont } from '../hub/Crayon';
import { Darkness, Light } from '../hub/Darkness';
import {
  barricade,
  body,
  BODY,
  BodyKind,
  cell,
  door,
  drawShell,
  G,
  H,
  pile,
  rng,
  rock,
  W,
  WALL,
} from '../hub/draw';
import { Eyes } from '../hub/Eyes';
import { book, brazier, debris, drawFlame, severedHead, throne, torch } from '../hub/props';
import { Input, KeyboardMouseSource } from '../input';
import { toScreen, toWorld } from '../iso';
import { persistNow, profile } from '../save';
import { ghostHint } from '../ui/ghostHint';
import { Screens } from '../ui/Screens';

type RoomName = 'hall' | 'throne';
type Collider = { x0: number; y0: number; x1: number; y1: number } | { cx: number; cy: number; rx: number; ry: number };

interface Interact {
  x: number;
  y: number;
  r: number;
  label: string;
  room: RoomName;
  act: () => void;
  enabled?: () => boolean;
}

interface Flame {
  g: G;
  glow: Phaser.GameObjects.Image;
  x: number;
  y: number;
  size: number;
  seed: number;
  room: RoomName;
}

interface Room {
  name: RoomName;
  objs: Phaser.GameObjects.GameObject[];
  colliders: Collider[];
  ambient: () => number;
}

const FEET_R = 9;
const DEPTH_DARK = 1e5;

export class HubScene extends Phaser.Scene {
  private input2!: Input;
  private player!: Player;
  private view!: PlayerView;
  private fx!: Fx;
  private dark!: Darkness;
  private rooms!: Record<RoomName, Room>;
  private room: RoomName = 'hall';
  private flames: Flame[] = [];
  private interacts: Interact[] = [];
  private eyes!: Eyes;
  private textBox: G | null = null;
  private band!: G;
  private follow = true;
  private bookGfx!: G;
  private bookGlow!: Phaser.GameObjects.Image;
  private bookRings!: G;
  private headGfx!: G;
  private headGlow!: Phaser.GameObjects.Image;
  private headOutline!: Phaser.GameObjects.RenderTexture;
  private voidGfx!: G;
  private voidK = 0;
  private floatPt = { x: 0, y: 0 };
  private camRot = 0;
  private camRate = 0;
  private iris: G | null = null;
  private skipWaiters: (() => void)[] = [];
  private clickIcon: G | null = null;
  private headLit = false;
  private bookOutline!: Phaser.GameObjects.RenderTexture;
  private bookPointed = false;
  private bookIntro = false;
  private prompt!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private fade!: Phaser.GameObjects.Rectangle;
  private lying: Phaser.GameObjects.Image | null = null;
  private lyingShadow: Phaser.GameObjects.Ellipse | null = null;
  private devMenu = DevMenu.get();

  private clock = 0;
  private controlled = false;
  private menu = false;
  private busy = false;
  private eyesFollow = false;
  private ambient = 0.5;
  private rumble = 0;
  private rumbleTimer = 2.2;
  private lightKick = 0;
  private beatPhase = 0;
  private bookPower = 1;
  private rings: { age: number; power: number }[] = [];
  private cam = { x: W / 2, y: H / 2, zoom: 1 };
  private camTarget = { x: W / 2, y: H / 2, zoom: 1 };
  private carry = false;
  private ambientHold = false;
  private toastTimer = 0;
  private lines: CrayonLine[] = [];

  private skipHall = false;

  constructor() {
    super('hub');
  }

  init(data?: { skipHall?: boolean; bookIntro?: boolean }): void {
    this.skipHall = data?.skipHall === true;
    this.bookIntro = data?.bookIntro === true;
    this.bookPointed = false;
  }

  create(): void {
    makePlaceholderArt(this);
    preloadCrayonFont();
    this.cameras.main.setBackgroundColor(0x050408);

    this.clock = 0;
    this.headLit = profile.introDone;
    this.controlled = false;
    this.menu = false;
    this.busy = false;
    this.eyesFollow = false;
    this.rumble = 0;
    this.rumbleTimer = 2.2;
    this.carry = false;
    this.ambientHold = false;
    this.flames = [];
    this.interacts = [];
    this.rings = [];
    this.lines = [];
    this.skipWaiters = [];
    this.clickIcon = null;
    this.voidK = 0;
    this.camRot = 0;
    this.camRate = 0;
    this.iris = null;
    this.lying = null;
    this.lyingShadow = null;
    this.bookPower = 1;
    this.cam = { x: W / 2, y: H / 2, zoom: 1 };
    this.camTarget = { x: W / 2, y: H / 2, zoom: 1 };
    this.follow = true;

    this.input2 = new Input([new KeyboardMouseSource(this.game.canvas)]);
    this.fx = new Fx(this);
    this.player = new Player();
    this.player.fireBlocked = true;
    this.view = new PlayerView(this, this.player, this.fx);
    this.view.hero = true;
    this.view.hideBow = true;
    this.dark = new Darkness(this, DEPTH_DARK);

    this.rooms = { hall: this.buildHall(), throne: this.buildThrone() };
    this.add.image(0, 0, Tex.vignette).setOrigin(0).setDisplaySize(W, H).setDepth(DEPTH_DARK + 0.5).setAlpha(0.5);

    this.prompt = this.add
      .text(0, 0, '', { fontFamily: 'monospace', fontSize: '15px', fontStyle: 'bold', color: '#f2d7a6', stroke: '#0a0710', strokeThickness: 4, align: 'center' })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH_DARK + 4)
      .setVisible(false);
    this.toastText = this.add
      .text(W / 2, H - 70, '', { fontFamily: 'monospace', fontSize: '16px', color: '#d9d2e9', stroke: '#0a0710', strokeThickness: 4, align: 'center' })
      .setOrigin(0.5)
      .setDepth(DEPTH_DARK + 4)
      .setAlpha(0);
    this.fade = this.add.rectangle(W / 2, H / 2, W * 4, H * 4, 0x000000).setDepth(2e6).setAlpha(1);

    this.setActions();
    // A click while the throne is speaking finishes the line, and the next one moves on.
    this.input.on('pointerdown', () => {
      const waiting = this.skipWaiters.splice(0);
      for (const w of waiting) w();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input2.destroy();
      this.tweens.killAll();
    });

    if (this.bookIntro) {
      this.showRoom('throne');
      this.setFeet(560, H - 90);
      this.player.aimX = 0;
      this.player.aimY = -1;
      this.ambient = this.rooms.throne.ambient();
      this.focus(560, 300, 1.1);
      this.tweens.add({ targets: this.fade, alpha: 0, duration: 900 });
      void this.bookUnlockScene();
    } else if (!profile.introDone && !cfg.hub.skipIntro && !this.skipHall) {
      this.showRoom('hall');
      void this.playIntro();
    } else {
      // The unlock scene was cut short last time; the book is opened for him rather than playing it again.
      if (profile.bookIntroSeen && !profile.bookUnlocked) {
        profile.bookUnlocked = true;
        persistNow();
      }
      this.showRoom('throne');
      this.setFeet(560, H - 90);
      this.player.aimX = 0;
      this.player.aimY = -1;
      if (profile.introDone) this.openEyesNow();
      this.ambient = this.rooms.throne.ambient();
      this.controlled = true;
      this.followPlayer(true);
      this.tweens.add({ targets: this.fade, alpha: 0, duration: 600 });
    }
  }

  // --- Building the rooms -------------------------------------------------------------------------------

  private newRoom(name: RoomName, ambient: () => number): Room {
    return { name, objs: [], colliders: [], ambient };
  }

  private gfx(room: Room, x: number, y: number, depth: number): G {
    const g = this.add.graphics().setPosition(x, y).setDepth(depth);
    room.objs.push(g);
    return g;
  }

  private ellipse(room: Room, cx: number, cy: number, rx: number, ry: number): void {
    room.colliders.push({ cx, cy, rx, ry });
  }

  private flame(room: Room, x: number, y: number, size: number): void {
    const g = this.gfx(room, x, y, DEPTH_DARK + 1.6);
    const glow = this.add.image(x, y - 14 * size, Tex.glow).setTint(0xff8a30).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH_DARK + 1);
    room.objs.push(glow);
    this.flames.push({ g, glow, x, y, size, seed: this.flames.length * 1.7, room: room.name });
  }

  private buildHall(): Room {
    const room = this.newRoom('hall', () => cfg.hub.ambientHall);
    const r = rng(7);
    drawShell(this.gfx(room, 0, 0, 0), r, { floor: 0x3a3441, wall: 0x453f50, trim: 0x4a4452, tint: 0x241018 });
    debris(this.gfx(room, 60, WALL + 20, 1), r, 90, W - 120, H - WALL - 60);

    // The open door to the north, torn off one hinge.
    door(this.gfx(room, 560, WALL + 6, 4), true);

    // The cell, cut into the wall on the left: a recess behind iron bars with a heavy lock.
    cell(this.gfx(room, 62, 34, 6), r, 250, 118);

    // Two torches on the wall either side of the door.
    for (const x of [330, 790]) {
      torch(this.gfx(room, x, 116, 116));
      this.flame(room, x, 70, 1);
    }

    const bodies: [BodyKind, number, number, number][] = [
      ['elephant', 420, 395, 0.85],
      ['dragon', 880, 475, 0.95],
      ['human', 700, 262, 1],
      ['human', 775, 215, 1.05],
      ['human', 392, 250, 1],
      ['human', 372, 522, 1.1],
      ['human', 650, 556, 1],
      ['human', 962, 335, 1],
      ['human', 805, 392, 1],
      ['human', 498, 436, 1],
      ['beast', 760, 312, 0.95],
      ['beast', 350, 470, 0.9],
      ['beast', 965, 215, 0.9],
      ['human', 560, 560, 1],
      ['human', 250, 330, 1.05],
      ['beast', 215, 470, 0.95],
      ['human', 1030, 430, 1],
      ['human', 140, 250, 1],
      ['beast', 690, 380, 0.85],
      ['human', 905, 275, 1],
      ['human', 420, 600, 1],
    ];
    for (const [kind, x, y, s] of bodies) {
      const g = this.gfx(room, x, y, y);
      body(g, r, kind, 0, 0, s);
      const size: Record<BodyKind, [number, number]> = { human: [25, 10], beast: [32, 12], elephant: [64, 24], dragon: [92, 38] };
      this.ellipse(room, x, y, size[kind][0] * s * BODY, size[kind][1] * s * BODY);
    }
    for (const [x, y, n, rx, ry] of [[1008, 568, 10, 50, 18], [175, 566, 9, 55, 18]] as const) {
      pile(this.gfx(room, 0, 0, y), r, x, y, rx, ry, n);
      this.ellipse(room, x, y, rx + 14, ry + 8);
    }

    return room;
  }

  private buildThrone(): Room {
    const room = this.newRoom('throne', () => cfg.hub.ambientThrone);
    const r = rng(23);
    drawShell(this.gfx(room, 0, 0, 0), r, { floor: 0x30283a, wall: 0x3a3246, trim: 0x40364a, tint: 0x2a0e18 });
    debris(this.gfx(room, 60, WALL + 20, 1), r, 90, W - 120, H - WALL - 60);

    // The way back, a low archway in the south wall.
    const back = this.gfx(room, 560, H - 6, H);
    back.setScale(0.55);
    door(back, false);

    throne(this.gfx(room, 560, 192, 192), r);
    // The back of the room is solid black that no light reaches; only the eyes and the hands show in it.
    this.band = this.gfx(room, 0, 0, DEPTH_DARK + 1.5);
    for (let y = 0; y < 220; y += 2) {
      const a = y < 150 ? 1 : Math.max(0, 1 - (y - 150) / 70) ** 1.5;
      this.band.fillStyle(0x000000, a);
      this.band.fillRect(0, y, W, 2);
    }
    room.colliders.push({ cx: 560, cy: 178, rx: 172, ry: 30 });
    this.eyes = new Eyes(this, 560, 100, DEPTH_DARK + 2);

    // Braziers either side of the throne.
    for (const x of [372, 748]) {
      brazier(this.gfx(room, x, 222, 222));
      this.flame(room, x, 190, 1.35);
      this.ellipse(room, x, 220, 32, 11);
    }

    // The heaps of the dead along the west wall, leaving a lane to the book.
    for (const [x, y, n, rx, ry] of [[150, 255, 34, 105, 50], [135, 492, 30, 95, 55], [275, 208, 10, 45, 22]] as const) {
      pile(this.gfx(room, 0, 0, y + ry * 0.6), r, x, y, rx, ry, n);
      this.ellipse(room, x, y + 6, rx + 12, ry + 6);
    }
    for (const [kind, x, y, s] of [['human', 770, 440, 1], ['beast', 640, 520, 1], ['human', 880, 540, 1.1], ['human', 330, 570, 1]] as const) {
      body(this.gfx(room, x, y, y), r, kind, 0, 0, s);
      this.ellipse(room, x, y, (kind === 'beast' ? 32 : 25) * s * BODY, (kind === 'beast' ? 12 : 10) * s * BODY);
    }
    pile(this.gfx(room, 0, 0, 585), r, 1010, 560, 50, 20, 9);
    this.ellipse(room, 1010, 560, 64, 26);

    // The severed head, top right, glowing a putrid green.
    this.headGfx = this.gfx(room, 930, 258, 258);
    severedHead(this.headGfx, r);
    this.ellipse(room, 930, 252, 64, 20);
    this.headGlow = this.add.image(930, 208, Tex.glow).setTint(0x9cff30).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH_DARK + 1);
    room.objs.push(this.headGlow);
    this.headOutline = this.outline(this.headGfx, 280, 260, 140, 200).setDepth(DEPTH_DARK + 1.7);
    room.objs.push(this.headOutline);
    this.interacts.push({
      x: 930,
      y: 278,
      r: 105,
      label: 'Delve into the mind',
      room: 'throne',
      act: () => {
        profile.visitedHead = true;
        void this.startBattle();
      },
      enabled: () => profile.introDone,
    });

    // The barricaded door in the east wall.
    const bar = this.gfx(room, 1096, 408, 408);
    bar.setScale(0.8);
    barricade(bar, r);
    this.interacts.push({ x: 1040, y: 360, r: 80, label: 'Push the door', room: 'throne', act: () => this.toast('Barred from the other side. Something heavy leans against it.') });

    // The floating book in the west.
    this.bookRings = this.gfx(room, 0, 0, 380);
    this.bookGfx = this.gfx(room, 94, 340, 372);
    book(this.bookGfx);
    this.bookOutline = this.outline(this.bookGfx, 110, 130, 55, 65).setDepth(DEPTH_DARK + 1.7);
    room.objs.push(this.bookOutline);
    this.bookGlow = this.add.image(94, 340, Tex.glow).setTint(0x4a90ff).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH_DARK + 1);
    room.objs.push(this.bookGlow);
    const shadow = this.add.ellipse(94, 398, 56, 14, 0x000000, 0.4).setDepth(371);
    room.objs.push(shadow);
    this.interacts.push({ x: 96, y: 392, r: 90, label: 'Reach for the book', room: 'throne', act: () => this.touchBook() });

    // The black void he hovers over while the throne speaks to him.
    this.voidGfx = this.gfx(room, 560, 294, 289);
    return room;
  }

  // A white rim around a drawn prop: its silhouette stamped around itself, with the prop itself cut out.
  private outline(src: G, w: number, h: number, ox: number, oy: number): Phaser.GameObjects.RenderTexture {
    const fill = this.add.renderTexture(0, 0, w, h).setOrigin(0);
    fill.draw(src, ox, oy);
    fill.setTintFill(0xffffff);
    const out = this.add.renderTexture(0, 0, w, h).setOrigin(ox / w, oy / h);
    const r = 3;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      out.draw(fill, Math.cos(a) * r, Math.sin(a) * r);
    }
    out.erase(src, ox, oy);
    fill.destroy();
    return out.setAlpha(0);
  }

  private setActions(): void {
    this.devMenu.setActions([
      { label: 'Replay intro (hallway)', run: () => this.restart(false) },
      { label: 'Replay book cutscene', run: () => this.restart(true) },
      { label: 'Go to throne room', run: () => void this.changeRoom('throne') },
      { label: 'Go to hallway', run: () => void this.changeRoom('hall') },
      { label: 'Start battle', run: () => void this.startBattle() },
      {
        label: 'Open skill tree',
        run: () => {
          this.menu = true;
          Screens.get().showTree(() => void this.startBattle(), () => {
            Screens.get().hide();
            this.menu = false;
          });
        },
      },
      { label: 'Open the book', run: () => this.openBook() },
      {
        label: 'Replay book unlock scene',
        run: () => {
          this.input2.destroy();
          Screens.get().hide();
          profile.introDone = true;
          profile.bookUnlocked = false;
          profile.bookOpened = false;
          profile.bookIntroSeen = false;
          persistNow();
          this.scene.restart({ bookIntro: true });
        },
      },
      {
        label: 'Unlock the book',
        run: () => {
          profile.bookUnlocked = true;
          persistNow();
        },
      },
      {
        label: 'Reset story flags',
        run: () => {
          profile.introDone = false;
          profile.bookUnlocked = false;
          profile.bookOpened = false;
          profile.bookIntroSeen = false;
          profile.bowHintShown = false;
          profile.visitedHead = false;
          persistNow();
        },
      },
    ]);
  }

  private restart(cutsceneOnly: boolean): void {
    this.input2.destroy();
    Screens.get().hide();
    profile.introDone = false;
    persistNow();
    this.scene.restart({ skipHall: cutsceneOnly });
  }

  // --- Helpers ------------------------------------------------------------------------------------------

  private sleep(sec: number): Promise<void> {
    return new Promise((res) => {
      this.tweens.addCounter({ from: 0, to: 1, duration: Math.max(1, (sec * 1000) / cfg.hub.cutsceneSpeed), onComplete: () => res() });
    });
  }

  private tw(config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((res) => {
      this.tweens.add({ ...config, duration: (config.duration as number) / cfg.hub.cutsceneSpeed, onComplete: () => res() });
    });
  }

  private feet(): { x: number; y: number } {
    return toScreen(this.player.x, this.player.y);
  }

  private setFeet(sx: number, sy: number): void {
    const w = toWorld(sx, sy);
    this.player.x = w.x;
    this.player.y = w.y;
    this.player.vx = 0;
    this.player.vy = 0;
  }

  private face(dx: number, dy: number): void {
    const w = toWorld(dx, dy);
    const len = Math.hypot(w.x, w.y) || 1;
    this.player.aimX = w.x / len;
    this.player.aimY = w.y / len;
  }

  private walkTo(sx: number, sy: number): Promise<void> {
    const from = this.feet();
    const dx = sx - from.x;
    const dy = sy - from.y;
    const dist = Math.hypot(dx, dy) || 1;
    this.face(dx, dy);
    const v = toWorld((dx / dist) * cfg.hub.walkSpeed, (dy / dist) * cfg.hub.walkSpeed);
    return new Promise((res) => {
      this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: (dist / cfg.hub.walkSpeed) * 1000,
        onUpdate: (t) => {
          const k = t.getValue() ?? 0;
          this.setFeet(from.x + dx * k, from.y + dy * k);
          this.player.vx = v.x;
          this.player.vy = v.y;
        },
        onComplete: () => {
          this.player.vx = 0;
          this.player.vy = 0;
          res();
        },
      });
    });
  }

  private toast(msg: string): void {
    this.toastText.setText(msg).setAlpha(1);
    this.toastTimer = 3;
  }

  private showRoom(name: RoomName): void {
    this.room = name;
    for (const room of Object.values(this.rooms)) for (const o of room.objs) (o as Phaser.GameObjects.Image).setVisible(room.name === name);
    this.eyes.setVisible(name === 'throne');
    this.prompt.setVisible(false);
  }

  private async changeRoom(to: RoomName): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.controlled = false;
    await this.tw({ targets: this.fade, alpha: 1, duration: 350 });
    this.showRoom(to);
    if (to === 'throne') this.setFeet(560, H - 86);
    else this.setFeet(560, WALL + 44);
    this.player.aimX = 0;
    this.player.aimY = to === 'throne' ? -1 : 1;
    this.view.setVisible(true);
    this.followPlayer(true);
    await this.tw({ targets: this.fade, alpha: 0, duration: 350 });
    this.controlled = true;
    this.busy = false;
  }

  // Into battle: the view spins in on Anathema until the screen is swallowed, then he drops into the fight.
  private async startBattle(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.controlled = false;
    this.menu = false;
    persistNow();
    Screens.get().hide();
    this.prompt.setVisible(false);
    if (this.room !== 'throne') {
      await this.tw({ targets: this.fade, alpha: 1, duration: 700 });
      this.scene.start('game', { dive: true });
      return;
    }
    const e = cfg.entry;
    const iris = this.add.graphics().setDepth(2e6 - 1);
    this.iris = iris;
    this.follow = false;
    this.camRate = 7;
    this.camTarget = { x: 930, y: 250, zoom: this.cam.zoom * e.swirlZoom };
    const big = 3000;
    const cam = this.cameras.main;
    const fit = Math.min(cam.width / W, cam.height / H);
    const reach = Math.hypot(cam.width, cam.height) / (2 * fit * this.cam.zoom);
    await this.tweenValue(0, 1, e.swirlTime * 1000, (k) => {
      this.camRot = k * k * e.swirlTurns * Math.PI * 2;
      const r = (1 - k) ** 2 * reach * 1.2;
      const wob = Math.min(1, r / 150) * 0.16;
      iris.clear();
      iris.lineStyle(big, 0x000000, 1);
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        const rr = r * (1 + wob * Math.sin(4 * a + k * 14)) + big / 2;
        pts.push(new Phaser.Math.Vector2(Math.cos(a) * rr, Math.sin(a) * rr));
      }
      iris.strokePoints(pts, true, true);
    }, 'Sine.easeIn');
    this.fade.setAlpha(1);
    this.scene.start('game', { dive: true });
  }

  private openEyesNow(): void {
    this.eyes.open = 1;
    this.eyesFollow = true;
  }

  // --- Update -------------------------------------------------------------------------------------------

  update(_time: number, deltaMs: number): void {
    const input = this.input2;
    input.update();
    if (input.justPressed('devMenu')) this.devMenu.toggle();
    if (this.menu) {
      input.endFrame();
      return;
    }
    const dt = Math.min(deltaMs / 1000, 0.05) * cfg.time.timeScale;
    this.tweens.timeScale = cfg.time.timeScale;
    this.clock += dt;

    // Space interacts when something is in reach, and then must not dash.
    const target = this.controlled ? this.findInteract() : null;
    let act: (() => void) | null = null;
    if (target && input.justPressed('dash')) {
      input.consume('dash');
      act = target.act;
    }
    this.updatePlayer(dt, input);
    this.updateRumble(dt);
    this.updateProps(dt);
    this.showPrompt(target);
    if (act && this.controlled) act();
    if (this.view && !this.lying) this.view.update(dt);
    if (this.lying) this.updateLying();
    this.fx.update(dt);
    this.updateCamera(dt);
    this.updateLights(dt);
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      this.toastText.setAlpha(Math.min(1, this.toastTimer));
    }
    input.endFrame();
  }

  private updatePlayer(dt: number, input: Input): void {
    if (this.carry) {
      this.setFeet(this.floatPt.x, this.floatPt.y);
      return;
    }
    if (!this.controlled) return;
    const cam = this.cameras.main;
    let aim = null;
    if (input.aim) {
      const wp = cam.getWorldPoint(input.aim.x, input.aim.y);
      aim = toWorld(wp.x, wp.y + cfg.render.aimHeight);
    }
    this.player.update(dt, input, aim);
    const p = this.feet();
    this.resolve(p);
    this.setFeetKeepVel(p.x, p.y);

    if (this.room === 'hall' && p.y < WALL + 4 && Math.abs(p.x - 560) < 44) void this.changeRoom('throne');
    else if (this.room === 'throne' && p.y > H - 52 && Math.abs(p.x - 560) < 56) void this.changeRoom('hall');
  }

  private setFeetKeepVel(sx: number, sy: number): void {
    const w = toWorld(sx, sy);
    this.player.x = w.x;
    this.player.y = w.y;
  }

  // Keeps the player's feet inside the room and out of props, in screen space.
  private resolve(p: { x: number; y: number }): void {
    const doorway = this.room === 'hall' && Math.abs(p.x - 560) < 40;
    const gate = this.room === 'throne' && Math.abs(p.x - 560) < 50;
    p.x = Phaser.Math.Clamp(p.x, 62, W - 62);
    p.y = Phaser.Math.Clamp(p.y, doorway ? WALL - 24 : WALL + 24, gate ? H - 24 : H - 46);
    for (const c of this.rooms[this.room].colliders) {
      if ('x0' in c) {
        const x0 = c.x0 - FEET_R;
        const x1 = c.x1 + FEET_R;
        const y0 = c.y0 - FEET_R * 0.6;
        const y1 = c.y1 + FEET_R * 0.6;
        if (p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1) {
          const d = [p.x - x0, x1 - p.x, p.y - y0, y1 - p.y];
          const m = Math.min(...d);
          if (m === d[0]) p.x = x0;
          else if (m === d[1]) p.x = x1;
          else if (m === d[2]) p.y = y0;
          else p.y = y1;
        }
      } else {
        const rx = c.rx + FEET_R;
        const ry = c.ry + FEET_R * 0.6;
        const ux = p.x - c.cx;
        const uy = p.y - c.cy;
        const d = Math.hypot(ux / rx, uy / ry);
        if (d < 1) {
          // Slide out along the surface normal so brushing past an edge never snaps sideways.
          const gx = ux / (rx * rx);
          const gy = uy / (ry * ry);
          const gl = Math.hypot(gx, gy);
          if (gl < 1e-9) p.y = c.cy + ry;
          else {
            const push = (1 - d) / (gl / Math.max(d, 1e-6));
            p.x += (gx / gl) * push;
            p.y += (gy / gl) * push;
          }
        }
      }
    }
  }

  // The fighting upstairs: every few seconds the ceiling shudders and dust drifts down.
  private updateRumble(dt: number): void {
    this.rumbleTimer -= dt;
    if (this.rumbleTimer <= 0 && cfg.hub.shakeInterval > 0) {
      this.rumbleTimer = cfg.hub.shakeInterval * (0.9 + Math.random() * 0.2);
      this.bump(cfg.hub.shakeStrength);
      for (let i = 0; i < 14; i++) {
        this.fx.particle({
          texture: Tex.smoke,
          x: 80 + Math.random() * (W - 160),
          y: Math.random() * 120,
          life: 1 + Math.random(),
          from: 0.7,
          to: 1.5,
          alpha: 0.45,
          tint: 0x8a8494,
          additive: false,
          vx: (Math.random() - 0.5) * 12,
          vy: 30 + Math.random() * 40,
          depth: DEPTH_DARK + 1,
        });
      }
      for (let i = 0; i < 7; i++) {
        this.fx.particle({ x: 80 + Math.random() * (W - 160), y: Math.random() * 60, life: 0.7, from: 0.12, to: 0.08, alpha: 0.8, tint: 0x9a96a4, vy: 260 + Math.random() * 120, depth: DEPTH_DARK + 1 });
      }
    }
    this.rumble *= Math.exp(-3.2 * dt);
    if (this.rumble < 0.05) this.rumble = 0;
  }

  private bump(amount: number): void {
    this.rumble = Math.max(this.rumble, amount);
    this.lightKick = 1;
  }

  private updateProps(dt: number): void {
    const t = this.clock;
    for (const f of this.flames) {
      const on = f.room === this.room;
      if (!on) continue;
      drawFlame(f.g, t, f.size, f.seed);
      const flick = 0.8 + 0.2 * Math.sin(t * 11 + f.seed * 5) + 0.1 * Math.sin(t * 23 + f.seed);
      f.glow.setScale(4.6 * f.size * (0.95 + 0.05 * flick)).setAlpha(0.3 * flick);
      if (Math.random() < dt * 5) {
        this.fx.particle({ x: f.x + (Math.random() - 0.5) * 10, y: f.y - 30 * f.size, life: 1.1, from: 0.1, to: 0.02, tint: 0xffb040, vx: (Math.random() - 0.5) * 14, vy: -40 - Math.random() * 30, depth: DEPTH_DARK + 1 });
      }
    }
    if (this.room !== 'throne') return;

    // The book's heartbeat: a double thump, each one rippling out across the floor.
    this.beatPhase += dt / (cfg.hub.heartbeatPeriod / this.bookPower);
    const prev = this.beatPhase - dt / (cfg.hub.heartbeatPeriod / this.bookPower);
    if (this.beatPhase >= 1) this.beatPhase -= 1;
    const cross = (a: number) => (prev < a && this.beatPhase >= a) || (prev > this.beatPhase && (a > prev || a <= this.beatPhase));
    if (cross(0)) this.rings.push({ age: 0, power: 1 });
    if (cross(0.24)) this.rings.push({ age: 0, power: 0.65 });
    const ph = this.beatPhase;
    const pulse = Math.exp(-((ph / 0.06) ** 2)) + 0.75 * Math.exp(-(((ph - 0.24) / 0.07) ** 2));
    const bob = Math.sin(t * 1.6) * 5;
    this.bookGfx.setPosition(94, 338 + bob).setScale(1 + 0.1 * pulse * this.bookPower).setAngle(Math.sin(t * 0.9) * 3);
    this.bookGlow.setPosition(94, 340 + bob).setScale(2.2 + 1.2 * pulse).setAlpha((0.4 + 0.5 * pulse) * Math.min(1.4, this.bookPower));
    this.drawRings(dt);
    // Once he has been sent to the book it flashes a white outline until he opens it.
    const flash = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * 6));
    const bookLit = (profile.bookUnlocked || this.bookPointed) && !profile.bookOpened;
    this.bookOutline.setPosition(this.bookGfx.x, this.bookGfx.y).setScale(this.bookGfx.scale).setAngle(this.bookGfx.angle).setAlpha(bookLit ? flash : 0);

    // The severed head pulses a sick green.
    const sick = 0.55 + 0.25 * Math.sin(t * 2.3) + 0.1 * Math.sin(t * 7.1);
    this.headGlow.setScale(3.8 + 0.4 * Math.sin(t * 1.4)).setAlpha(0.22 * sick);
    // Once he has been told where to go, Anathema flashes a white outline until he goes in.
    const lit = this.headLit && !profile.visitedHead;
    this.headGfx.setAngle(Math.sin(t * 0.7) * 0.8);
    this.headOutline.setPosition(this.headGfx.x, this.headGfx.y).setAngle(this.headGfx.angle).setAlpha(lit ? flash : 0);
    this.drawVoid(t);

    const p = this.feet();
    this.eyes.update(dt, p.x, p.y - 22, this.eyesFollow);
  }

  // The void under his feet swells open when he is lifted to the eyes and closes again when he is put down.
  private drawVoid(t: number): void {
    const g = this.voidGfx;
    g.clear();
    const k = this.voidK;
    if (k <= 0.001) return;
    // It travels with him, always drawn beneath his body.
    const f = this.feet();
    g.setPosition(f.x, f.y + 3).setDepth(f.y - 30);
    const spin = t * 2;
    g.fillStyle(0x7a2fd0, 0.18 * k).fillEllipse(0, 0, 150 * k, 56 * k);
    g.fillStyle(0x000000, 1).fillEllipse(0, 0, 112 * k, 40 * k);
    g.lineStyle(2, 0xb070ff, 0.7 * k).strokeEllipse(0, 0, 118 * k, 44 * k);
    for (let i = 0; i < 3; i++) {
      const a = spin + (i * Math.PI * 2) / 3;
      g.lineStyle(2, 0x3a0f6a, 0.9 * k).lineBetween(Math.cos(a) * 12 * k, Math.sin(a) * 4.5 * k, Math.cos(a + 0.9) * 50 * k, Math.sin(a + 0.9) * 17 * k);
    }
  }

  private drawRings(dt: number): void {
    const g = this.bookRings;
    g.clear();
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      ring.age += dt;
      const k = ring.age / 1.5;
      if (k >= 1) {
        this.rings.splice(i, 1);
        continue;
      }
      const rad = 30 + k * 150 * ring.power * Math.min(1.5, this.bookPower);
      const a = (1 - k) * (1 - k) * ring.power;
      // A bright crest with a dark trough just inside it, like light bending around the swell.
      g.lineStyle(7, 0x000000, 0.22 * a);
      g.strokeEllipse(94, 392, (rad - 7) * 2, (rad - 7) * 1.1);
      g.lineStyle(3, 0x9cc8ff, 0.6 * a);
      g.strokeEllipse(94, 392, rad * 2, rad * 1.1);
      g.lineStyle(10, 0x4a90ff, 0.12 * a);
      g.strokeEllipse(94, 392, (rad + 6) * 2, (rad + 6) * 1.1);
    }
  }

  private findInteract(): Interact | null {
    const p = this.feet();
    let best: Interact | null = null;
    let bestD = Infinity;
    for (const it of this.interacts) {
      if (it.room !== this.room || (it.enabled && !it.enabled())) continue;
      const d = Math.hypot((p.x - it.x) / it.r, (p.y - it.y) / (it.r * 0.6));
      if (d < 1 && d < bestD) {
        best = it;
        bestD = d;
      }
    }
    return best;
  }

  private showPrompt(it: Interact | null): void {
    if (!it || !this.controlled) {
      this.prompt.setVisible(false);
      return;
    }
    this.prompt.setText(`${it.label}\n(Space)`).setPosition(it.x, it.y - 92 - Math.sin(this.clock * 4) * 2).setVisible(true);
  }

  private updateCamera(dt: number): void {
    const cam = this.cameras.main;
    if (this.follow) {
      const p = this.feet();
      this.camTarget = { x: p.x, y: p.y - 30, zoom: cfg.hub.zoom };
    }
    const k = 1 - Math.exp(-(this.camRate || (this.follow ? 4 : 2.6)) * dt);
    this.cam.x += (this.camTarget.x - this.cam.x) * k;
    this.cam.y += (this.camTarget.y - this.cam.y) * k;
    this.cam.zoom += (this.camTarget.zoom - this.cam.zoom) * k;
    const fit = Math.min(cam.width / W, cam.height / H);
    // Keep the view inside the room so the edge of the world is never shown.
    const halfW = cam.width / (2 * fit * this.cam.zoom);
    const halfH = cam.height / (2 * fit * this.cam.zoom);
    const cx = halfW * 2 >= W ? W / 2 : Phaser.Math.Clamp(this.cam.x, halfW, W - halfW);
    const cy = halfH * 2 >= H ? H / 2 : Phaser.Math.Clamp(this.cam.y, halfH, H - halfH);
    // Thumps are low and heavy: a quick sinking and bounce rather than a jitter.
    const sx = Math.sin(this.clock * 47) * this.rumble * 0.5 + this.fx.shakeOffset.x;
    const sy = Math.sin(this.clock * 37 + 1) * this.rumble + this.fx.shakeOffset.y;
    cam.setZoom(fit * this.cam.zoom);
    cam.setRotation(this.camRot);
    cam.centerOn(cx + sx, cy + sy);
    this.iris?.setPosition(cx + sx, cy + sy);
  }

  private focus(x: number, y: number, zoom: number): void {
    this.follow = false;
    this.camTarget = { x, y, zoom };
  }

  private followPlayer(snap = false): void {
    this.follow = true;
    if (snap) {
      const p = this.feet();
      this.cam = { x: p.x, y: p.y - 30, zoom: cfg.hub.zoom };
    }
  }

  private updateLights(dt: number): void {
    const room = this.rooms[this.room];
    if (!this.ambientHold) this.ambient += (room.ambient() - this.ambient) * (1 - Math.exp(-1.5 * dt));
    this.lightKick = Math.max(0, this.lightKick - dt * 2.5);
    const t = this.clock;
    const kick = 1 - 0.35 * this.lightKick;
    const lights: Light[] = [];
    for (const f of this.flames) {
      if (f.room !== this.room) continue;
      const flick = 0.93 + 0.07 * Math.sin(t * 9 + f.seed * 4) + 0.04 * Math.sin(t * 21 + f.seed);
      lights.push({ x: f.x, y: f.y + 50, radius: cfg.hub.lightRadius * flick * f.size ** 0.5, strength: 0.95 * kick });
    }
    if (this.room === 'throne') {
      const pulse = 0.5 + 0.5 * Math.sin(this.beatPhase * Math.PI * 2);
      lights.push({ x: 94, y: 370, radius: 120 + 40 * pulse, strength: 0.55 });
      lights.push({ x: 930, y: 230, radius: 130, strength: 0.4 });
      lights.push({ x: 1060, y: 360, radius: 120, strength: 0.3 });
    } else {
      lights.push({ x: 560, y: 160, radius: 130, strength: 0.28 });
    }
    // A faint glow around the player so he never vanishes into the dark.
    const p = this.feet();
    if (this.lying) lights.push({ x: 575, y: 470, radius: 130, strength: 0.35 });
    else lights.push({ x: p.x, y: p.y - 20, radius: 190, strength: 0.4 });
    this.dark.draw(this.ambient, lights);
  }

  // --- The hallway opening ------------------------------------------------------------------------------

  private updateLying(): void {
    if (!this.lying) return;
    const breathe = 1 + Math.sin(this.clock * 1.7) * 0.012;
    this.lying.setScale(cfg.render.pixelScale, cfg.render.pixelScale * breathe);
  }

  private async playIntro(): Promise<void> {
    const px = cfg.render.pixelScale;
    this.busy = true;
    this.ambient = cfg.hub.ambientStart;
    this.ambientHold = true;
    this.eyesFollow = false;
    this.setFeet(560, 470);
    this.view.setVisible(false);
    this.lyingShadow = this.add.ellipse(582, 472, 86, 14, 0x000000, 0.5).setDepth(469);
    this.lying = this.add.image(560, 470, Tex.hero).setOrigin(0.5, 1).setScale(px).setAngle(82).setTint(0xb4b0c4).setDepth(470);
    this.rooms.hall.objs.push(this.lyingShadow, this.lying);
    this.tweens.add({ targets: this.fade, alpha: 0, duration: 1800 });
    this.focus(W / 2, H / 2 + 20, 1);
    await this.sleep(3.4);

    // Rocks break loose and crash down beside him.
    await this.dropRock(632, 488, 15);
    await this.sleep(0.9);
    await this.dropRock(512, 494, 12);
    await this.sleep(0.8);
    await this.dropRock(598, 524, 9);
    await this.sleep(1.1);

    // He stirs, props himself up, and the light comes back as he stands.
    const lying = this.lying;
    await this.tw({ targets: lying, angle: 74, duration: 500, ease: 'Sine.easeInOut' });
    await this.tw({ targets: lying, angle: 80, duration: 600, ease: 'Sine.easeInOut' });
    await this.sleep(0.4);
    this.ambientHold = false;
    this.ambient = cfg.hub.ambientStart;
    this.focus(W / 2, H / 2 + 30, 1.1);
    void this.tw({ targets: lying, angle: 50, duration: 1700, ease: 'Sine.easeInOut' });
    await this.sleep(1.2);
    await this.tw({ targets: lying, angle: 14, duration: 1500, ease: 'Sine.easeInOut' });
    lying.destroy();
    this.lyingShadow?.destroy();
    this.lying = null;
    this.lyingShadow = null;
    this.view.setVisible(true);
    this.player.aimX = 0.7;
    this.player.aimY = 0.7;
    this.controlled = true;
    this.busy = false;
    this.followPlayer();
    ghostHint(this, this.fx, ['(W A S D to move. Space to Dash)'], { x: W / 2, y: 372, depth: DEPTH_DARK + 3, hold: (cfg.hub.hintTime + 0.8) / cfg.hub.cutsceneSpeed });
  }

  private dropRock(x: number, y: number, size: number): Promise<void> {
    const r = rng(Math.floor(x * 7 + y));
    const g = this.add.graphics().setPosition(x, -90).setDepth(DEPTH_DARK - 10);
    rock(g, r, size * 1.6);
    const shadow = this.add.ellipse(x, y, size * 3, size * 1.2, 0x000000, 0).setDepth(2);
    this.rooms.hall.objs.push(g, shadow);
    this.tweens.add({ targets: shadow, alpha: 0.5, scaleX: 1.3, duration: 650 / cfg.hub.cutsceneSpeed });
    return new Promise((res) => {
      this.tweens.add({
        targets: g,
        y,
        duration: 650 / cfg.hub.cutsceneSpeed,
        ease: 'Quad.easeIn',
        onComplete: () => {
          g.setDepth(y);
          this.bump(15);
          this.fx.addShake(6);
          this.fx.smoke(x, y - 6, 22, 24);
          for (let i = 0; i < 10; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 90 + Math.random() * 180;
            this.fx.particle({ x, y: y - 8, life: 0.55, from: 0.14, to: 0.09, tint: 0x8a8794, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5 - 150, depth: y + 2 });
          }
          this.rooms.hall.colliders.push({ cx: x, cy: y, rx: size * 1.1, ry: size * 0.55 });
          res();
        },
      });
    });
  }

  // --- The book and what answers --------------------------------------------------------------------------

  private touchBook(): void {
    if (!profile.introDone) {
      void this.bookCutscene();
      return;
    }
    if (!profile.bookUnlocked) {
      this.bookPower = 1.8;
      this.bump(3);
      void this.sleep(1.4).then(() => (this.bookPower = 1));
      this.toast('The pages will not turn. Not yet.');
      return;
    }
    this.openBook();
  }

  private openBook(): void {
    this.menu = true;
    profile.bookOpened = true;
    persistNow();
    Screens.get().showBook(() => {
      Screens.get().hide();
      this.menu = false;
    });
  }

  private async wrapLines(text: string, size: number, maxW: number): Promise<string[]> {
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.font = `${size}px ${CRAYON_FONT}`;
    const words = text.split(' ');
    const out: string[] = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (cur && ctx.measureText(next).width + size * 0.06 * next.length > maxW) {
        out.push(cur);
        cur = w;
      } else cur = next;
    }
    if (cur) out.push(cur);
    return out;
  }

  // Draws one line of scrawl at the given place, writing it in left to right.
  private async scrawl(text: string, x: number, y: number, size: number): Promise<CrayonLine> {
    const line = crayonLine(this, text, size);
    line.image.setPosition(x, y).setDepth(DEPTH_DARK + 3);
    this.lines.push(line);
    const t = { v: 0 };
    await this.skippable({ targets: t, v: 1, duration: 70 * Math.max(4, text.length), ease: 'Sine.easeInOut', onUpdate: () => line.setReveal(t.v) });
    line.setReveal(1);
    return line;
  }

  // A tween that a click finishes early (the caller sets the end state afterwards).
  private skippable(config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((res) => {
      let done = false;
      const finish = (natural: boolean) => {
        if (done) return;
        done = true;
        this.skipWaiters = this.skipWaiters.filter((f) => f !== waiter);
        if (!natural) tween.stop();
        res();
      };
      const waiter = () => finish(false);
      const tween = this.tweens.add({ ...config, duration: (config.duration as number) / cfg.hub.cutsceneSpeed, onComplete: () => finish(true) });
      this.skipWaiters.push(waiter);
    });
  }

  // A little mouse on the corner of the text box says the next click moves on; it sits on the border so the text keeps its spacing.
  private clickToContinue(right: number, bottom: number): Promise<void> {
    const g = this.add.graphics().setPosition(right - 20, bottom).setDepth(DEPTH_DARK + 3.2);
    g.fillStyle(0x16121f, 1).fillRoundedRect(-11, -13, 22, 26, 8);
    g.lineStyle(2, 0xffffff, 0.9).strokeRoundedRect(-8, -10, 16, 20, 6);
    g.lineBetween(-8, -2, 8, -2);
    g.lineBetween(0, -10, 0, -2);
    g.fillStyle(0xffffff, 0.9).fillRoundedRect(-7, -9, 7, 7, 2);
    this.clickIcon = g;
    this.tweens.add({ targets: g, alpha: 0.35, duration: 500, yoyo: true, repeat: -1 });
    return new Promise((res) => this.skipWaiters.push(res));
  }

  private async clearLines(): Promise<void> {
    const lines = this.lines.slice();
    const box = this.textBox;
    this.lines = [];
    this.textBox = null;
    if (this.clickIcon) {
      this.tweens.killTweensOf(this.clickIcon);
      this.clickIcon.destroy();
      this.clickIcon = null;
    }
    await this.tw({ targets: [...lines.map((l) => l.image), ...(box ? [box] : [])], alpha: 0, duration: 450 });
    for (const l of lines) l.destroy();
    box?.destroy();
  }

  // The panel the throne's words are written on.
  private openBox(x: number, y: number, w: number, h: number): void {
    const g = this.add.graphics().setDepth(DEPTH_DARK + 2.8).setAlpha(0);
    g.fillStyle(0x16121f, 0.9);
    g.fillRoundedRect(x, y, w, h, 10);
    g.lineStyle(2, 0xffffff, 0.85);
    g.strokeRoundedRect(x, y, w, h, 10);
    this.textBox = g;
    this.tweens.add({ targets: g, alpha: 1, duration: 200 });
  }

  private measure(text: string, size: number): number {
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.font = `${size}px ${CRAYON_FONT}`;
    return ctx.measureText(text).width + size * 0.06 * text.length + 36;
  }

  // The throne speaks in a text box beside its eyes: wrapped to a column on one side, then wiped away.
  private async say(text: string, side: 'left' | 'right'): Promise<void> {
    const size = cfg.hub.textSize;
    const rows = await this.wrapLines(text, size, side === 'left' ? 380 : 410);
    const x = side === 'right' ? 640 : 54;
    const lh = size * 1.5;
    const w = Math.max(...rows.map((r) => this.measure(r, size)));
    this.openBox(x - 8, 16, w + 26, rows.length * lh + 22);
    for (let i = 0; i < rows.length; i++) await this.scrawl(rows[i], x, 46 + i * lh, size);
    await this.clickToContinue(x - 8 + w + 26, 16 + rows.length * lh + 22);
    await this.clearLines();
  }

  private async tweenValue(from: number, to: number, ms: number, set: (v: number) => void, ease = 'Sine.easeInOut'): Promise<void> {
    const o = { v: from };
    await this.tw({ targets: o, v: to, duration: ms, ease, onUpdate: () => set(o.v) });
  }

  // After the first skill point is earned and lost: he is sent for, and walks to the book, whose pages are now open.
  private async bookUnlockScene(): Promise<void> {
    this.busy = true;
    this.controlled = false;
    this.eyesFollow = true;
    this.openEyesNow();
    profile.bookIntroSeen = true;
    persistNow();
    await this.sleep(1.2);
    await this.say('oh dear oh dear', 'right');
    await this.say("you're getting much stronger", 'right');
    await this.sleep(1);
    await this.say('but so are they', 'right');
    await this.sleep(1);

    const walk = this.walkTo(172, 404);
    await this.say('come, learn the ways of our family', 'right');
    await walk;
    this.face(-1, 0);
    this.bookPointed = true;
    this.bookPower = 1.8;
    void this.sleep(1.4).then(() => (this.bookPower = 1));
    this.bump(4);
    await this.sleep(0.8);

    profile.bookUnlocked = true;
    persistNow();
    this.followPlayer();
    this.controlled = true;
    this.busy = false;
  }

  private async bookCutscene(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.controlled = false;
    this.prompt.setVisible(false);

    // He walks up to the book and slowly reaches out.
    this.focus(300, 330, 1.25);
    await this.walkTo(168, 394);
    this.face(-1, 0);
    this.view.armsRate = 1.1;
    this.player.armsUpTimer = 999;
    await this.sleep(1.8);
    this.bookPower = 2.4;
    this.bump(5);
    await this.sleep(1.5);

    // Something on the throne wakes: two slits crack open and turn toward him.
    this.focus(560, 230, 1.08);
    this.eyesFollow = true;
    this.bump(8);
    await this.tweenValue(0, 0.35, 900, (v) => (this.eyes.open = v));
    await this.tweenValue(0.35, 0.1, 400, (v) => (this.eyes.open = v));
    await this.tweenValue(0.1, 1, 1300, (v) => (this.eyes.open = v));
    await this.sleep(0.7);
    await this.say('well now, what have we here', 'right');

    // He is drawn up off the floor toward the eyes with a black void opening beneath his feet, and it travels with him.
    this.bookPower = 1;
    const from = this.feet();
    this.floatPt = { x: from.x, y: from.y };
    this.carry = true;
    this.view.armsRate = 0.06;
    void this.tweenValue(0, 1, 700, (v) => (this.voidK = v), 'Back.easeOut');
    void this.sleep(1.2).then(() => {
      this.player.armsUpTimer = 0;
      this.face(0, -1);
    });
    await this.tw({ targets: this.floatPt, x: 560, y: 290, duration: 2800, ease: 'Sine.easeInOut' });
    await this.sleep(0.5);

    await this.say('oh, what a blessed boon', 'right');
    await this.say('fear not, you are safe in here my friend', 'left');
    await this.say('though, for how long, i cannot say', 'left');

    // The eyes drift up to the ceiling and the fighting above.
    await this.sleep(1);
    this.eyes.glance.y = -1.4;
    void this.sleep(1.6).then(() => (this.eyes.glance.y = 0));
    await this.say('these wretched humans...', 'left');
    await this.say("nary a day passes they aren't at war", 'left');
    await this.say("we're too precious to be collateral damage", 'left');

    // The void closes and he is lowered to the floor.
    await this.tweenValue(1, 0, 450, (v) => (this.voidK = v), 'Quad.easeIn');
    this.face(1, -0.4);
    await this.tw({ targets: this.floatPt, x: 560, y: 376, duration: 1700, ease: 'Sine.easeInOut' });
    this.carry = false;
    this.view.armsRate = 0.06;

    // A run of short, heavy lines; the eyes go wide on the third.
    const x = 640;
    const size = cfg.hub.textSize;
    const lh = size * 1.5;
    const boxW = this.measure('Become my champion', size) + 26;
    this.openBox(x - 8, 16, boxW, lh * 3 + 22);
    await this.scrawl('Learn my ways.', x, 46, size);
    await this.sleep(0.32);
    await this.scrawl('Grow in Power', x, 46 + lh, size);
    await this.sleep(0.32);
    // The eyes open wide as the line is being written.
    this.bump(6);
    void this.tweenValue(0, 1, 300, (v) => (this.eyes.wide = v)).then(() => this.sleep(1.2)).then(() => this.tweenValue(1, 0, 500, (v) => (this.eyes.wide = v)));
    await this.scrawl('Become my champion', x, 46 + lh * 2, size);
    await this.clickToContinue(x - 8 + boxW, 16 + lh * 3 + 22);
    await this.clearLines();

    await this.say('let us show them the true scope of war', 'right');
    await this.sleep(1);
    await this.say("alas, you're too weak to be a threat", 'right');

    // He is sent to the head in the corner and walks there himself, stopping short of its glow.
    this.headLit = true;
    this.focus(W / 2, 300, 1);
    const walk = this.walkTo(930, 336);
    await this.say('come, darling, learn from Anathema', 'left');
    await walk;
    this.face(0, -1);
    await this.say('few can withstand his memories for long...', 'left');

    profile.introDone = true;
    persistNow();
    this.followPlayer();
    this.controlled = true;
    this.busy = false;
  }
}
