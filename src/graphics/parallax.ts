import Phaser from 'phaser';
import { artScale, bake, radial } from './art';
import { bgKey, TILE } from './scenery-art';
import { DEPTH } from './depth';
import { quality } from './quality';
import type { StageTheme } from './themes';

// Layer bottoms in world y (the floor top is 480 in every stage) and camera factors.
const LAYERS = [
  { name: 'clouds', factor: 0.05, drift: 7, baseline: 232, depth: DEPTH.sky + 1, rank: 5 },
  { name: 'far', factor: 0.12, drift: 0, baseline: 454, depth: DEPTH.far, rank: 1 },
  { name: 'mid', factor: 0.3, drift: 0, baseline: 488, depth: DEPTH.mid, rank: 4 },
  { name: 'near', factor: 0.55, drift: 0, baseline: 546, depth: DEPTH.near, rank: 1 },
] as const;
const FOREGROUND_FACTOR = 1.25;
const SUN_FACTOR = 0.02;

type Layer = { images: Phaser.GameObjects.Image[]; factor: number; drift: number; baseline: number };
type Mote = { image: Phaser.GameObjects.Image; u: number; v: number; vu: number; vv: number; phase: number };

// Screen-anchored parallax bands, positioned in the camera's PRE_RENDER so they never lag the view.
export class Parallax {
  private sky: Phaser.GameObjects.Image;
  private sun: Phaser.GameObjects.Image;
  private pit: Phaser.GameObjects.Image;
  private layers: Layer[] = [];
  private foreground?: Layer;
  private motes: Mote[] = [];
  private lastTime = 0;

  constructor(private scene: Phaser.Scene, private theme: StageTheme) {
    const preset = quality();
    const image = (key: string, depth: number) => {
      const object = scene.add.image(0, 0, key).setOrigin(0, 1).setScrollFactor(0).setDepth(depth);
      return object.setScale(1 / artScale(key));
    };
    this.sky = scene.add.image(0, 0, bgKey(theme, 'sky')).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.sky);
    this.sun = scene.add.image(0, 0, bgKey(theme, 'sun')).setScrollFactor(0).setDepth(DEPTH.sky + 0.5);
    this.sun.setScale(1 / artScale(bgKey(theme, 'sun')));
    this.pit = scene.add.image(0, 0, bgKey(theme, 'pit')).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.near - 0.5);
    for (const layer of LAYERS) {
      if (layer.rank > preset.backgroundLayers) continue;
      const key = bgKey(theme, layer.name);
      this.layers.push({ images: [0, 1, 2].map(() => image(key, layer.depth)), factor: layer.factor, drift: layer.drift, baseline: layer.baseline });
    }
    if (preset.foreground) {
      const key = bgKey(theme, 'foreground');
      this.foreground = { images: [0, 1, 2].map(() => image(key, DEPTH.foreground)), factor: FOREGROUND_FACTOR, drift: 0, baseline: 0 };
    }
    if (!scene.textures.exists('fx-mote')) {
      bake(scene, 'fx-mote', 12, 12, (ctx) => {
        ctx.fillStyle = radial(ctx, 6, 6, 6, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]);
        ctx.fillRect(0, 0, 12, 12);
      });
    }
    for (let i = 0; i < preset.ambient; i++) {
      const mote = scene.add.image(0, 0, 'fx-mote').setScrollFactor(0).setDepth(DEPTH.ambientBack).setTint(theme.ambient.color);
      mote.setScale((0.35 + (i % 3) * 0.15) / artScale('fx-mote'));
      const rising = theme.ambient.kind === 'ember';
      this.motes.push({ image: mote, u: (i * 0.618) % 1, v: (i * 0.371) % 1, vu: (i % 2 ? 0.012 : -0.008), vv: rising ? -0.05 : -0.008, phase: i * 1.7 });
    }
    const camera = scene.cameras.main;
    camera.on(Phaser.Cameras.Scene2D.Events.PRE_RENDER, this.update, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => camera.off(Phaser.Cameras.Scene2D.Events.PRE_RENDER, this.update, this));
  }

  private update(camera: Phaser.Cameras.Scene2D.Camera) {
    const view = camera.worldView;
    // Scroll-factor-0 objects are zoomed around the camera centre; this is the visible area in their space.
    const left = camera.width / 2 - view.width / 2;
    const top = camera.height / 2 - view.height / 2;
    const now = this.scene.time.now / 1000;
    const dt = Math.min(0.05, Math.max(0, now - this.lastTime));
    this.lastTime = now;
    this.sky.setPosition(left - 2, top - 2).setDisplaySize(view.width + 4, view.height + 4);
    this.sun.setPosition(left + view.width * this.theme.sun.x - view.x * SUN_FACTOR % view.width, top + this.theme.sun.y - view.y);
    const place = (layer: Layer, y: number) => {
      const offset = view.x * layer.factor + layer.drift * now;
      const start = -(((offset % TILE) + TILE) % TILE);
      layer.images.forEach((image, index) => {
        const x = left + start + index * TILE;
        image.setPosition(x, y).setVisible(x < left + view.width && x + TILE > left);
      });
    };
    for (const layer of this.layers) place(layer, top + layer.baseline - view.y);
    const nearBottom = LAYERS[LAYERS.length - 1].baseline - 2;
    this.pit.setPosition(left - 2, top + nearBottom - view.y).setDisplaySize(view.width + 4, Math.max(1, view.bottom - nearBottom + 4));
    if (this.foreground) place(this.foreground, top + view.height + 6);
    for (const mote of this.motes) {
      mote.u = (mote.u + mote.vu * dt + 1) % 1;
      mote.v = (mote.v + mote.vv * dt + 1) % 1;
      const wobble = Math.sin(now * 1.3 + mote.phase);
      const x = left + mote.u * view.width + wobble * 10 - (view.x * 0.4) % view.width;
      mote.image.setPosition(left + (((x - left) % view.width) + view.width) % view.width, top + mote.v * view.height * 0.85)
        .setAlpha(this.theme.ambient.kind === 'firefly' ? 0.35 + 0.65 * Math.max(0, wobble) : 0.75);
    }
  }
}

