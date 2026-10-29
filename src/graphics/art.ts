import Phaser from 'phaser';
import { INK } from './palette';
import { quality } from './quality';

// Texture baking for code-painted (temporary) art and the scale registry shared with loaded PNGs.
// All drawing happens in logical pixels; the canvas is `scale` times larger so art stays crisp
// when the game renders above 1x. External PNGs follow the @2x spec (see ASSET_MANIFEST.md).

export type Painter = (ctx: CanvasRenderingContext2D) => void;

const scales = new Map<string, number>();
const external = new Set<string>();

export function registerExternal(key: string, scale = 2) {
  scales.set(key, scale);
  external.add(key);
}

export function isExternal(key: string) { return external.has(key); }

// Texture pixels per logical pixel for `key` (1 for anything not baked or registered).
export function artScale(key: string) { return scales.get(key) ?? 1; }

export function makeCanvas(width: number, height: number, scale: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  return { canvas, ctx };
}

// Paint once per key; an external PNG with the same key always wins.
export function bake(scene: Phaser.Scene, key: string, width: number, height: number, paint: Painter, scale = quality().textureScale) {
  if (scene.textures.exists(key)) return;
  const { canvas, ctx } = makeCanvas(width, height, scale);
  paint(ctx);
  scene.textures.addCanvas(key, canvas);
  scales.set(key, scale);
}

export function unbake(scene: Phaser.Scene, key: string) {
  if (isExternal(key) || !scene.textures.exists(key)) return;
  scene.textures.remove(key);
  scales.delete(key);
}

// Drops every painted texture so the next bake uses the current quality preset.
export function unbakeAll(scene: Phaser.Scene) {
  for (const key of [...scales.keys()]) {
    if (isExternal(key) || !scene.textures.exists(key)) continue;
    // Animations keep frames of the removed texture; drop them so they are rebuilt.
    for (const animation of scene.anims.getAnimsFromTexture(key)) scene.anims.remove(animation);
    unbake(scene, key);
  }
}

// Shows a texture at its logical size regardless of its pixel scale.
export function fitArt<T extends Phaser.GameObjects.Components.Transform & { texture: Phaser.Textures.Texture }>(object: T, extra = 1) {
  const scale = extra / artScale(object.texture.key);
  object.setScale(scale);
  return object;
}

// ----- drawing helpers -----

export function ellipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, rotation = 0) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, rotation, 0, Math.PI * 2);
}

// Manual path: CanvasRenderingContext2D.roundRect is missing on iOS 15 WebViews.
export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function linear(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  return gradient;
}

export function radial(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, stops: [number, string][], x0 = x, y0 = y, r0 = 0) {
  const gradient = ctx.createRadialGradient(x0, y0, r0, x, y, r);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  return gradient;
}

// Fill the current path, then outline it with ink.
export function fillStroke(ctx: CanvasRenderingContext2D, fill: string | CanvasGradient, line = 2.2, color = INK) {
  ctx.fillStyle = fill;
  ctx.fill();
  if (line > 0) {
    ctx.lineWidth = line;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
}

// Soft glow without blur filters: a radial falloff disc.
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 0.4) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = radial(ctx, x, y, r, [[0, color], [1, 'rgba(0,0,0,0)']]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Paint inside the current path only.
export function clipped(ctx: CanvasRenderingContext2D, path: () => void, paint: () => void) {
  ctx.save();
  path();
  ctx.clip();
  paint();
  ctx.restore();
}

export function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number, points = 5, rotation = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = rotation + i * Math.PI / points;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// Deterministic randomness so painted scenery is identical on every run and tiles seamlessly.
export function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Mix two #rrggbb colours.
export function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const channel = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, '0')}`;
}
