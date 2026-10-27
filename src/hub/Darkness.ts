import Phaser from 'phaser';
import { H, W } from './draw';

export interface Light {
  x: number;
  y: number;
  radius: number;
  strength: number;
}

const SCALE = 2;
const LIGHT = 'hub_light';

// A dark veil over the room with soft holes punched out for each light, drawn at half resolution.
export class Darkness {
  private rt: Phaser.GameObjects.RenderTexture;
  private brush: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, depth: number) {
    this.rt = scene.add.renderTexture(0, 0, W / SCALE, H / SCALE).setOrigin(0).setScale(SCALE).setDepth(depth);
    if (!scene.textures.exists(LIGHT)) {
      const tex = scene.textures.createCanvas(LIGHT, 256, 256)!;
      const ctx = tex.getContext();
      const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.35, 'rgba(255,255,255,0.8)');
      grad.addColorStop(0.7, 'rgba(255,255,255,0.32)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);
      tex.refresh();
    }
    this.brush = scene.make.image({ key: LIGHT, add: false });
  }

  draw(ambient: number, lights: Light[]): void {
    this.rt.fill(0x03020a, Phaser.Math.Clamp(ambient, 0, 1));
    const texW = this.brush.width;
    for (const l of lights) {
      this.brush.setScale((l.radius * 2) / SCALE / texW).setAlpha(Phaser.Math.Clamp(l.strength, 0, 1));
      this.rt.erase(this.brush, l.x / SCALE, l.y / SCALE);
    }
  }

  setVisible(v: boolean): void {
    this.rt.setVisible(v);
  }
}
