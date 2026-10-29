import Phaser from 'phaser';
import { bake, ellipse, linear, mix, radial, roundRect, seeded, unbake } from './art';
import { INK, INK_SOFT } from './palette';
import type { StageTheme } from './themes';

// TEMPORARY ART: code-painted parallax bands, terrain tiles and decorations per theme.
// Bands are seamless: every shape is periodic over TILE or drawn wrapped around the edges.

export const TILE = 1024;
export const BAND = { clouds: 190, far: 320, mid: 300, near: 170, foreground: 56 };
export const TOP_BAND = { height: 32, surface: 10 };
export const LEDGE = { height: 26, top: 4 };

type Ctx = CanvasRenderingContext2D;
type Term = [amplitude: number, frequency: number, phase: number];
const TAU = Math.PI * 2;

export const bgKey = (theme: StageTheme, layer: string) => `bg-${theme.id}-${layer}`;
export const terrainKey = (theme: StageTheme, part: string) => `terrain-${theme.id}-${part}`;
export const decoKey = (theme: StageTheme, kind: string) => `deco-${theme.id}-${kind}`;

const periodic = (x: number, terms: Term[], width = TILE) => terms.reduce((sum, [a, k, p]) => sum + a * Math.sin(TAU * k * x / width + p), 0);

function ridge(ctx: Ctx, base: number, terms: Term[], bottom: number, width = TILE) {
  ctx.beginPath();
  ctx.moveTo(0, bottom);
  for (let x = 0; x <= width; x += 4) ctx.lineTo(x, base - periodic(x, terms, width));
  ctx.lineTo(width, bottom);
  ctx.closePath();
}

// Draw at x and again across whichever edge the shape overlaps, so the band tiles cleanly.
function wrapped(x: number, reach: number, draw: (x: number) => void, width = TILE) {
  draw(x);
  if (x - reach < 0) draw(x + width);
  if (x + reach > width) draw(x - width);
}

function circles(ctx: Ctx, list: [number, number, number][], fill: string | CanvasGradient) {
  ctx.fillStyle = fill;
  for (const [x, y, r] of list) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
}

function mist(ctx: Ctx, from: number, to: number, color: string, alpha: number) {
  ctx.fillStyle = linear(ctx, 0, from, 0, to, [[0, hexAlpha(color, 0)], [1, hexAlpha(color, alpha)]]);
  ctx.fillRect(0, from, TILE, to - from);
}

function hexAlpha(hex: string, alpha: number) {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

function canopy(ctx: Ctx, x: number, y: number, size: number, light: string, dark: string, outline = 0) {
  const puffs: [number, number, number][] = [[-0.55, 0.15, 0.5], [0, -0.2, 0.62], [0.55, 0.12, 0.5], [0, 0.3, 0.55]];
  if (outline > 0) {
    ctx.fillStyle = hexAlpha(INK_SOFT, 0.55);
    for (const [dx, dy, r] of puffs) { ctx.beginPath(); ctx.arc(x + dx * size, y + dy * size, r * size + outline, 0, TAU); ctx.fill(); }
  }
  circles(ctx, puffs.map(([dx, dy, r]) => [x + dx * size, y + dy * size + size * 0.12, r * size]), dark);
  circles(ctx, puffs.map(([dx, dy, r]) => [x + dx * size - size * 0.06, y + dy * size - size * 0.04, r * size * 0.86]), light);
}

// ----- sky, sun, clouds -----

function paintSky(ctx: Ctx, theme: StageTheme) {
  const [top, middle, horizon] = theme.sky;
  ctx.fillStyle = linear(ctx, 0, 0, 0, 600, [[0, top], [0.55, middle], [1, horizon]]);
  ctx.fillRect(0, 0, 4, 600);
}

function paintSun(ctx: Ctx, theme: StageTheme) {
  const { color, glow, radius } = theme.sun;
  const c = radius * 2.6;
  ctx.fillStyle = radial(ctx, c, c, c, [[0, glow], [1, 'rgba(255,255,255,0)']]);
  ctx.fillRect(0, 0, c * 2, c * 2);
  ctx.beginPath();
  ctx.arc(c, c, radius, 0, TAU);
  ctx.fillStyle = radial(ctx, c, c, radius, [[0, '#FFFFFF'], [0.7, color], [1, mix(color, '#FFFFFF', 0.3)]]);
  ctx.fill();
}

function cloud(ctx: Ctx, x: number, y: number, scale: number, theme: StageTheme) {
  const puffs: [number, number, number][] = [[-34, 6, 20], [-14, -8, 27], [12, -12, 30], [36, -2, 22], [54, 8, 15], [6, 8, 24]];
  circles(ctx, puffs.map(([dx, dy, r]) => [x + dx * scale, y + (dy + 5) * scale, r * scale]), theme.cloud.shade);
  circles(ctx, puffs.map(([dx, dy, r]) => [x + dx * scale, y + dy * scale, r * scale * 0.96]), theme.cloud.light);
}

function paintClouds(ctx: Ctx, theme: StageTheme) {
  const rng = seeded(11);
  for (let i = 0; i < 6; i++) {
    const scale = 0.6 + rng() * 0.7;
    const x = i * TILE / 6 + rng() * 80;
    const y = 40 + rng() * 100;
    ctx.globalAlpha = 0.75 + scale * 0.2;
    wrapped(x, 80 * scale, (cx) => cloud(ctx, cx, y, scale, theme));
  }
  ctx.globalAlpha = 1;
}

// ----- far band -----

function island(ctx: Ctx, x: number, y: number, w: number, theme: StageTheme, rng: () => number) {
  const { far } = theme;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.quadraticCurveTo(x - w * 0.36, y + w * 0.42, x - w * 0.04, y + w * 0.8);
  ctx.quadraticCurveTo(x + w * 0.34, y + w * 0.44, x + w / 2, y);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, y, 0, y + w * 0.8, [[0, far.base], [1, far.dark]]);
  ctx.fill();
  ctx.fillStyle = linear(ctx, 0, y + w * 0.6, 0, y + w * 1.6, [[0, hexAlpha(far.water, 0.85)], [1, hexAlpha(far.water, 0)]]);
  ctx.fillRect(x + w * 0.18, y + 2, w * 0.07, w * 1.6);
  ellipse(ctx, x, y, w / 2 + 4, w * 0.08);
  ctx.fillStyle = far.cap;
  ctx.fill();
  for (let i = 0; i < 3; i++) canopy(ctx, x - w * 0.3 + i * w * 0.28 + rng() * 6, y - w * 0.08, w * (0.1 + rng() * 0.05), mix(far.cap, '#FFFFFF', 0.15), far.cap);
}

function paintFar(ctx: Ctx, theme: StageTheme) {
  const { far } = theme;
  const rng = seeded(23);
  const h = BAND.far;
  if (theme.id === 'meadow') {
    ridge(ctx, 200, [[42, 2, 0.3], [24, 5, 1.1], [10, 9, 2]], h);
    ctx.fillStyle = linear(ctx, 0, 140, 0, h, [[0, far.light], [1, far.base]]);
    ctx.fill();
    for (const [x, y, w] of [[230, 70, 120], [700, 40, 90], [930, 120, 60]] as const) wrapped(x, w, (cx) => island(ctx, cx, y, w, theme, rng));
    ridge(ctx, 262, [[22, 3, 1.7], [11, 7, 0.4]], h);
    ctx.fillStyle = linear(ctx, 0, 220, 0, h, [[0, mix(far.base, far.cap, 0.35)], [1, far.dark]]);
    ctx.fill();
  } else if (theme.id === 'forest') {
    for (let i = 0; i < 9; i++) {
      const x = i * TILE / 9 + rng() * 40;
      const top = 60 + rng() * 60;
      wrapped(x, 90, (cx) => {
        ctx.fillStyle = far.dark;
        ctx.fillRect(cx - 9, top + 40, 18, h - top);
        canopy(ctx, cx, top + 30, 52 + rng() * 10, far.light, far.base);
      });
    }
    ridge(ctx, 270, [[14, 3, 0.5], [7, 8, 2]], h);
    ctx.fillStyle = far.dark;
    ctx.fill();
  } else {
    for (const [x, peak, w] of [[180, 70, 300], [620, 40, 380], [920, 110, 220]] as const) {
      wrapped(x, w / 2, (cx) => {
        ctx.beginPath();
        ctx.moveTo(cx - w / 2, h);
        ctx.lineTo(cx - 26, peak);
        ctx.lineTo(cx + 26, peak);
        ctx.lineTo(cx + w / 2, h);
        ctx.closePath();
        ctx.fillStyle = linear(ctx, 0, peak, 0, h, [[0, far.light], [1, far.base]]);
        ctx.fill();
        ctx.fillStyle = linear(ctx, 0, peak, 0, peak + 120, [[0, hexAlpha(far.water, 0.9)], [1, hexAlpha(far.water, 0)]]);
        ctx.fillRect(cx - 6, peak, 12, 120);
      });
    }
    ridge(ctx, 270, [[16, 4, 1], [8, 9, 0.3]], h);
    ctx.fillStyle = far.dark;
    ctx.fill();
  }
  mist(ctx, h * 0.55, h, theme.sky[2], 0.55);
}

// ----- mid band -----

function mesa(ctx: Ctx, x: number, w: number, height: number, base: number, theme: StageTheme) {
  const { rock, cap } = theme.mid;
  const top = base - height;
  ctx.beginPath();
  ctx.moveTo(x, base);
  ctx.lineTo(x + 7, top + 14);
  ctx.quadraticCurveTo(x + 10, top, x + 22, top);
  ctx.lineTo(x + w - 22, top);
  ctx.quadraticCurveTo(x + w - 10, top, x + w - 7, top + 14);
  ctx.lineTo(x + w, base);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, top, 0, base, [[0, rock[0]], [0.45, rock[1]], [1, rock[2]]]);
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = hexAlpha(INK_SOFT, 0.55);
  ctx.stroke();
  ctx.strokeStyle = hexAlpha(rock[2], 0.6);
  ctx.lineWidth = 1.2;
  for (let sx = x + 18; sx < x + w - 12; sx += 22) {
    ctx.beginPath();
    ctx.moveTo(sx, top + 20);
    ctx.lineTo(sx + 4, base);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(x + 4, top + 10);
  for (let sx = x + 4; sx <= x + w - 4; sx += 6) ctx.lineTo(sx, top + 9 + Math.sin(sx * 0.7) * 2.5 + (sx % 18 < 6 ? 5 : 0));
  ctx.lineTo(x + w - 10, top - 3);
  ctx.quadraticCurveTo(x + w / 2, top - 8, x + 10, top - 3);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, top - 8, 0, top + 14, [[0, cap[0]], [1, cap[1]]]);
  ctx.fill();
}

function arch(ctx: Ctx, x: number, base: number, height: number, theme: StageTheme) {
  const [light, dark] = theme.mid.ruin;
  const top = base - height;
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = hexAlpha(INK_SOFT, 0.6);
  for (const px of [x - 44, x + 44]) {
    roundRect(ctx, px - 12, top + 24, 24, height - 24, 3);
    ctx.fillStyle = linear(ctx, px - 12, 0, px + 12, 0, [[0, light], [1, dark]]);
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(x, top + 30, 56, Math.PI, 0);
  ctx.arc(x, top + 30, 32, 0, Math.PI, true);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, top - 26, 0, top + 30, [[0, light], [1, dark]]);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = theme.mid.cap[1];
  for (let i = 0; i < 7; i++) {
    const angle = Math.PI + (i + 0.5) * Math.PI / 7;
    ellipse(ctx, x + Math.cos(angle) * 46, top + 30 + Math.sin(angle) * 46, 7, 4, angle + Math.PI / 2);
    ctx.fill();
  }
}

function paintMid(ctx: Ctx, theme: StageTheme) {
  const rng = seeded(37);
  const h = BAND.mid;
  const { tree } = theme.mid;
  if (theme.id === 'meadow') {
    wrapped(560, 110, (x) => arch(ctx, x, h - 10, 150, theme));
    for (const [x, w, height] of [[40, 170, 150], [300, 130, 210], [760, 210, 120]] as const) {
      wrapped(x + w / 2, w / 2 + 30, (cx) => {
        mesa(ctx, cx - w / 2, w, height, h, theme);
        for (let i = 0; i < 2; i++) canopy(ctx, cx - w * 0.22 + i * w * 0.4, h - height - 18, 18 + rng() * 6, tree[0], tree[1], 1.2);
      });
    }
  } else if (theme.id === 'forest') {
    for (let i = 0; i < 5; i++) {
      const x = i * TILE / 5 + 40 + rng() * 60;
      wrapped(x, 120, (cx) => {
        roundRect(ctx, cx - 16, 70, 32, h - 70, 8);
        ctx.fillStyle = linear(ctx, cx - 16, 0, cx + 16, 0, [[0, theme.mid.rock[0]], [0.6, theme.mid.rock[1]], [1, theme.mid.rock[2]]]);
        ctx.fill();
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = hexAlpha(INK_SOFT, 0.55);
        ctx.stroke();
        canopy(ctx, cx, 60, 70, tree[0], tree[1], 1.2);
        ctx.strokeStyle = theme.mid.cap[1];
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx + 30, 90);
        ctx.quadraticCurveTo(cx + 40, 150, cx + 34, 200);
        ctx.stroke();
      });
    }
  } else {
    for (let i = 0; i < 7; i++) {
      const x = i * TILE / 7 + rng() * 40;
      const height = 90 + rng() * 140;
      wrapped(x, 40, (cx) => mesa(ctx, cx - 26, 52, height, h, theme));
    }
    ctx.fillStyle = linear(ctx, 0, 0, 0, h, [[0, hexAlpha(theme.glow ?? '#FF7A3A', 0)], [1, hexAlpha(theme.glow ?? '#FF7A3A', 0.35)]]);
    ctx.fillRect(0, h * 0.5, TILE, h * 0.5);
  }
  mist(ctx, h * 0.6, h, theme.sky[2], 0.35);
}

// ----- near band -----

function paintNear(ctx: Ctx, theme: StageTheme) {
  const { near } = theme;
  const h = BAND.near;
  const terms: Term[] = [[16, 2, 0.5], [9, 5, 2.1], [5, 11, 1.3]];
  ridge(ctx, 90, terms, h);
  ctx.fillStyle = linear(ctx, 0, 50, 0, h, [[0, near.light], [0.4, near.base], [1, near.dark]]);
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = hexAlpha(INK_SOFT, 0.45);
  ctx.beginPath();
  for (let x = 0; x <= TILE; x += 4) ctx.lineTo(x, 90 - periodic(x, terms));
  ctx.stroke();
  const rng = seeded(53);
  for (let i = 0; i < 14; i++) {
    const x = i * TILE / 14 + rng() * 40;
    const size = 12 + rng() * 10;
    wrapped(x, size * 1.4, (cx) => {
      const y = 90 - periodic(((cx % TILE) + TILE) % TILE, terms) + 6;
      if (theme.id === 'volcano') {
        ellipse(ctx, cx, y, size, size * 0.6);
        ctx.fillStyle = near.bush[0];
        ctx.fill();
      } else canopy(ctx, cx, y - size * 0.3, size, near.bush[0], near.bush[1], 1);
    });
  }
}

// Depth below the near hills, visible through pits.
function paintPit(ctx: Ctx, theme: StageTheme) {
  ctx.fillStyle = linear(ctx, 0, 0, 0, 64, [[0, theme.near.dark], [1, theme.foreground[1]]]);
  ctx.fillRect(0, 0, 4, 64);
}

function paintForeground(ctx: Ctx, theme: StageTheme) {
  const [light, dark] = theme.foreground;
  const h = BAND.foreground;
  const rng = seeded(71);
  for (let i = 0; i < 46; i++) {
    const x = rng() * TILE;
    const height = 18 + rng() * 26;
    wrapped(x, 12, (cx) => {
      ctx.fillStyle = rng() < 0.5 ? light : dark;
      ctx.beginPath();
      ctx.moveTo(cx - 6, h);
      ctx.quadraticCurveTo(cx - 3, h - height * 0.6, cx + (rng() - 0.5) * 10, h - height);
      ctx.quadraticCurveTo(cx + 1, h - height * 0.5, cx + 5, h);
      ctx.closePath();
      ctx.fill();
    });
  }
  if (theme.id === 'meadow') {
    for (let i = 0; i < 6; i++) {
      const x = rng() * TILE;
      const y = h - 20 - rng() * 14;
      wrapped(x, 8, (cx) => flower(ctx, cx, y, theme.flowers[i % theme.flowers.length], 1.2));
    }
  }
}

function flower(ctx: Ctx, x: number, y: number, color: string, scale = 1) {
  ctx.fillStyle = color;
  for (let i = 0; i < 5; i++) {
    const angle = i * TAU / 5;
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * 3 * scale, y + Math.sin(angle) * 3 * scale, 2.4 * scale, 0, TAU);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x, y, 1.8 * scale, 0, TAU);
  ctx.fillStyle = '#FFE7A0';
  ctx.fill();
}

// ----- terrain tiles -----

function paintSoil(ctx: Ctx, theme: StageTheme) {
  const [, base, dark] = theme.soil;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 128);
  const rng = seeded(97);
  for (let i = 0; i < 70; i++) {
    const x = rng() * 128;
    const y = rng() * 128;
    ctx.fillStyle = hexAlpha(dark, 0.45);
    ctx.fillRect(x, y, 2, 2);
  }
  for (let i = 0; i < 9; i++) {
    const x = rng() * 128;
    const y = rng() * 128;
    const r = 4 + rng() * 6;
    const draw = (cx: number, cy: number) => {
      ellipse(ctx, cx, cy, r, r * 0.72, rng() * 0.6);
      ctx.fillStyle = linear(ctx, cx - r, cy - r, cx + r, cy + r, [[0, theme.stone[0]], [1, theme.stone[1]]]);
      ctx.fill();
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = hexAlpha(INK_SOFT, 0.55);
      ctx.stroke();
    };
    for (const dx of [-128, 0, 128]) for (const dy of [-128, 0, 128]) draw(x + dx, y + dy);
  }
}

function paintTopBand(ctx: Ctx, theme: StageTheme) {
  const [light, base, dark] = theme.grass;
  const { height, surface } = TOP_BAND;
  const bottom = (x: number) => surface + 11 + 3 * Math.sin(TAU * 3 * x / 128) + 2 * Math.sin(TAU * 7 * x / 128 + 1);
  ctx.beginPath();
  ctx.moveTo(0, surface);
  ctx.lineTo(128, surface);
  for (let x = 128; x >= 0; x -= 2) ctx.lineTo(x, bottom(x));
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, surface, 0, surface + 16, [[0, light], [0.45, base], [1, dark]]);
  ctx.fill();
  ctx.beginPath();
  for (let x = 0; x <= 128; x += 2) ctx.lineTo(x, bottom(x));
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = hexAlpha(INK_SOFT, 0.7);
  ctx.stroke();
  const rng = seeded(131);
  for (let i = 0; i < 26; i++) {
    const x = rng() * 128;
    const tall = 3 + rng() * 6;
    const lean = (rng() - 0.5) * 4;
    wrapped(x, 4, (cx) => {
      ctx.beginPath();
      ctx.moveTo(cx - 2.2, surface + 1.5);
      ctx.quadraticCurveTo(cx - 0.5, surface - tall * 0.5, cx + lean, surface - tall);
      ctx.quadraticCurveTo(cx + 0.8, surface - tall * 0.4, cx + 2.2, surface + 1.5);
      ctx.closePath();
      ctx.fillStyle = rng() < 0.5 ? light : base;
      ctx.fill();
    }, 128);
  }
  ctx.fillStyle = hexAlpha('#FFFFFF', 0.28);
  ctx.fillRect(0, surface + 1, 128, 1.5);
}

function paintSide(ctx: Ctx, theme: StageTheme) {
  const [, , dark] = theme.soil;
  ctx.fillStyle = linear(ctx, 0, 0, 14, 0, [[0, hexAlpha(dark, 0.95)], [1, hexAlpha(dark, 0)]]);
  ctx.fillRect(0, 0, 14, 64);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, 2.2, 64);
}

// Mirrored copy for right-hand faces.
function paintSideRight(ctx: Ctx, theme: StageTheme) {
  ctx.translate(14, 0);
  ctx.scale(-1, 1);
  paintSide(ctx, theme);
}

function paintCorner(ctx: Ctx, theme: StageTheme) {
  const [light, base, dark] = theme.grass;
  ctx.beginPath();
  ctx.moveTo(26, 10);
  ctx.lineTo(10, 10);
  ctx.quadraticCurveTo(2.5, 10.5, 2.4, 18);
  ctx.quadraticCurveTo(2.8, 27, 9, 26);
  ctx.quadraticCurveTo(12, 22, 16, 25);
  ctx.quadraticCurveTo(21, 20, 26, 22);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, 10, 0, 27, [[0, light], [0.5, base], [1, dark]]);
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.moveTo(26, 10);
  ctx.lineTo(10, 10);
  ctx.quadraticCurveTo(2.5, 10.5, 2.4, 18);
  ctx.quadraticCurveTo(2.8, 27, 9, 26);
  ctx.stroke();
}

function paintUnderside(ctx: Ctx, theme: StageTheme) {
  const [, , dark] = theme.soil;
  ctx.fillStyle = linear(ctx, 0, 0, 0, 10, [[0, hexAlpha(dark, 0)], [1, dark]]);
  ctx.fillRect(0, 0, 128, 10);
  ctx.beginPath();
  ctx.moveTo(0, 10);
  for (let x = 0; x <= 128; x += 4) ctx.lineTo(x, 10 + 2 * Math.sin(TAU * 4 * x / 128) + (x % 32 === 16 ? 4 : 0));
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function paintShade(ctx: Ctx) {
  ctx.fillStyle = linear(ctx, 0, 0, 0, 64, [[0, 'rgba(43,34,54,0)'], [1, 'rgba(43,34,54,0.42)']]);
  ctx.fillRect(0, 0, 4, 64);
}

function paintLedge(ctx: Ctx, theme: StageTheme) {
  const [light, base, dark] = theme.ledge;
  const { height, top } = LEDGE;
  ctx.fillStyle = linear(ctx, 0, top, 0, height - 3, [[0, light], [0.5, base], [1, dark]]);
  ctx.fillRect(0, top, 128, height - top - 3);
  ctx.strokeStyle = hexAlpha(INK_SOFT, 0.75);
  ctx.lineWidth = 1.2;
  const plank = theme.id === 'forest';
  for (let x = plank ? 16 : 32; x < 128; x += plank ? 16 : 32) {
    ctx.beginPath();
    ctx.moveTo(x, top + 4);
    ctx.lineTo(x, height - 4);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(43,34,54,0.35)';
  ctx.fillRect(0, height - 6, 128, 3);
  const [mossLight, moss] = theme.ledgeTop;
  ctx.beginPath();
  ctx.moveTo(0, top - 1);
  ctx.lineTo(128, top - 1);
  for (let x = 128; x >= 0; x -= 2) ctx.lineTo(x, top + 4 + 1.6 * Math.sin(TAU * 5 * x / 128) + (x % 32 < 4 ? 3 : 0));
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, top - 1, 0, top + 7, [[0, mossLight], [1, moss]]);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.fillRect(0, top - 2, 128, 2);
  ctx.fillRect(0, height - 3, 128, 2);
}

function paintLedgeCap(ctx: Ctx, theme: StageTheme) {
  const [light, base, dark] = theme.ledge;
  const { height, top } = LEDGE;
  ctx.beginPath();
  ctx.moveTo(14, top - 2);
  ctx.lineTo(7, top - 2);
  ctx.quadraticCurveTo(1.2, top - 1, 1.2, top + 6);
  ctx.lineTo(1.2, height - 8);
  ctx.quadraticCurveTo(1.2, height - 2, 7, height - 2);
  ctx.lineTo(14, height - 2);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, top, 0, height, [[0, light], [0.5, base], [1, dark]]);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ellipse(ctx, 8, top + 1.5, 6.5, 3.2);
  ctx.fillStyle = theme.ledgeTop[0];
  ctx.fill();
}

// ----- decorations -----

function paintTuft(ctx: Ctx, theme: StageTheme) {
  const [light, base, dark] = theme.grass;
  for (const [dx, tall, color] of [[-6, 9, dark], [0, 13, base], [6, 10, light], [-2, 8, light]] as const) {
    ctx.beginPath();
    ctx.moveTo(10 + dx - 3, 16);
    ctx.quadraticCurveTo(10 + dx - 1, 16 - tall * 0.6, 10 + dx + 1.5, 16 - tall);
    ctx.quadraticCurveTo(10 + dx + 1, 16 - tall * 0.4, 10 + dx + 3, 16);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
}

function paintFlowerDeco(ctx: Ctx, theme: StageTheme) {
  ctx.strokeStyle = theme.grass[2];
  ctx.lineWidth = 1.2;
  for (const [x, color] of [[5, theme.flowers[0]], [12, theme.flowers[1 % theme.flowers.length]]] as const) {
    ctx.beginPath();
    ctx.moveTo(x, 20);
    ctx.lineTo(x + 0.5, 10);
    ctx.stroke();
    flower(ctx, x + 0.5, 9, color, 0.9);
  }
}

function paintRock(ctx: Ctx, theme: StageTheme) {
  ellipse(ctx, 11, 11, 9, 6.5);
  ctx.fillStyle = linear(ctx, 2, 5, 18, 17, [[0, theme.stone[0]], [1, theme.stone[1]]]);
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = INK_SOFT;
  ctx.stroke();
  ellipse(ctx, 8, 8, 3, 1.4, -0.4);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fill();
}

const PAINTERS: [string, number, number, (ctx: Ctx, theme: StageTheme) => void, 'bg' | 'terrain' | 'deco'][] = [
  ['sky', 4, 600, paintSky, 'bg'],
  ['sun', 0, 0, paintSun, 'bg'],
  ['clouds', TILE, BAND.clouds, paintClouds, 'bg'],
  ['far', TILE, BAND.far, paintFar, 'bg'],
  ['mid', TILE, BAND.mid, paintMid, 'bg'],
  ['near', TILE, BAND.near, paintNear, 'bg'],
  ['foreground', TILE, BAND.foreground, paintForeground, 'bg'],
  ['pit', 4, 64, paintPit, 'bg'],
  ['soil', 128, 128, paintSoil, 'terrain'],
  ['top', 128, TOP_BAND.height, paintTopBand, 'terrain'],
  ['side', 14, 64, paintSide, 'terrain'],
  ['side-right', 14, 64, paintSideRight, 'terrain'],
  ['corner', 28, 30, paintCorner, 'terrain'],
  ['under', 128, 18, paintUnderside, 'terrain'],
  ['shade', 4, 64, (ctx) => paintShade(ctx), 'terrain'],
  ['ledge', 128, LEDGE.height, paintLedge, 'terrain'],
  ['ledge-cap', 14, LEDGE.height, paintLedgeCap, 'terrain'],
  ['tuft', 20, 18, paintTuft, 'deco'],
  ['flower', 18, 22, paintFlowerDeco, 'deco'],
  ['rock', 22, 18, paintRock, 'deco'],
];

const baked = new Set<string>();

// Only the current theme stays in GPU memory; switching themes drops the previous one.
export function createSceneryArt(scene: Phaser.Scene, theme: StageTheme) {
  for (const id of baked) {
    if (id === theme.id) continue;
    for (const [name, , , , group] of PAINTERS) unbake(scene, `${group}-${id}-${name}`);
    baked.delete(id);
  }
  for (const [name, width, height, paint, group] of PAINTERS) {
    const size = name === 'sun' ? theme.sun.radius * 5.2 : 0;
    bake(scene, `${group}-${theme.id}-${name}`, width || size, height || size, (ctx) => paint(ctx, theme));
  }
  baked.add(theme.id);
}
