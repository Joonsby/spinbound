import Phaser from 'phaser';
import { bake, clipped, ellipse, fillStroke, glow, linear, radial, roundRect, star } from './art';
import { ENEMY, INK } from './palette';
import type { EnemyKind } from '../stages';

// TEMPORARY ART: code-painted monsters, one family per world so every world meets new faces.
// Each species is a body (plus optional wings or rotors) in the same outlined, soft-shaded style
// as the robot. Ground monsters face right with their feet on the bottom pivot.

type Ctx = CanvasRenderingContext2D;
type Palette = readonly [string, string, string];
type Paint = (ctx: Ctx) => void;
type Part = { width: number; height: number; ox: number; oy: number; paint: Paint };
export type Wings = Part & { anchors: [number, number, boolean][]; motion: 'flap' | 'spin'; amp: number; speed: number };
export type Species = { id: string; body: Part; wings?: Wings };

const shade = (ctx: Ctx, x: number, y: number, r: number, [light, base, dark]: Palette) =>
  radial(ctx, x, y, r, [[0, light], [0.6, base], [1, dark]], x - r * 0.3, y - r * 0.35, 0);

export function eye(ctx: Ctx, x: number, y: number, rx: number, ry: number, lookX = 1) {
  ellipse(ctx, x, y, rx, ry);
  fillStroke(ctx, '#FFFFFF', 1.2);
  ellipse(ctx, x + lookX * rx * 0.3, y + ry * 0.15, rx * 0.55, ry * 0.55);
  ctx.fillStyle = INK;
  ctx.fill();
  ellipse(ctx, x + lookX * rx * 0.1, y - ry * 0.2, rx * 0.2, rx * 0.2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
}

function cheeks(ctx: Ctx, points: [number, number][], color = 'rgba(255,140,170,0.55)') {
  for (const [x, y] of points) {
    ellipse(ctx, x, y, 2.4, 1.4);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

function smile(ctx: Ctx, x: number, y: number, r: number, width = 1.4) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.lineWidth = width;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function shine(ctx: Ctx, x: number, y: number, rx: number, ry: number, angle = -0.5, alpha = 0.6) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ellipse(ctx, x, y, rx, ry, angle);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.restore();
}

function path(ctx: Ctx, points: [number, number][]) {
  ctx.beginPath();
  points.forEach(([x, y], index) => { if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  ctx.closePath();
}

// ── Walkers ────────────────────────────────────────────────────────────────

const slime = (palette: Palette): Paint => (ctx) => {
  ctx.beginPath();
  ctx.moveTo(4, 33);
  ctx.quadraticCurveTo(1.5, 19, 11, 10);
  ctx.quadraticCurveTo(22, 0.5, 33, 10);
  ctx.quadraticCurveTo(42.5, 19, 40, 33);
  ctx.quadraticCurveTo(22, 36.5, 4, 33);
  ctx.closePath();
  fillStroke(ctx, radial(ctx, 22, 20, 24, [[0, palette[0]], [0.55, palette[1]], [1, palette[2]]], 14, 11, 0), 2.2);
  shine(ctx, 13, 12, 5, 2.8, -0.7, 0.75);
  shine(ctx, 9.5, 17, 1.4, 1.4, 0, 0.75);
  eye(ctx, 20, 18, 3.8, 4.8);
  eye(ctx, 30, 18, 3.6, 4.6);
  smile(ctx, 25.5, 24.5, 3);
  cheeks(ctx, [[15, 25], [36, 25]]);
};

const snail = (shell: Palette): Paint => (ctx) => {
  ctx.beginPath();
  ctx.moveTo(5, 37.5);
  ctx.quadraticCurveTo(3, 31, 10, 30);
  ctx.lineTo(34, 29);
  ctx.quadraticCurveTo(36, 20, 41, 19.5);
  ctx.quadraticCurveTo(47, 20, 46.5, 28);
  ctx.quadraticCurveTo(46.5, 37.5, 40, 37.5);
  ctx.closePath();
  fillStroke(ctx, linear(ctx, 0, 19, 0, 38, [[0, '#E4F7C4'], [0.5, '#B5E07E'], [1, '#7DB850']]), 2);
  for (const [base, tipX, tipY] of [[39.5, 37, 9], [43.5, 45, 10]]) {
    ctx.beginPath();
    ctx.moveTo(base, 21);
    ctx.lineTo(tipX, tipY);
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#B5E07E';
    ctx.stroke();
    eye(ctx, tipX, tipY, 2.8, 3);
  }
  smile(ctx, 43, 28, 2, 1.3);
  ellipse(ctx, 20, 21, 13.5, 13);
  fillStroke(ctx, shade(ctx, 20, 21, 15, shell), 2.2);
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const angle = i * 0.32;
    const r = 1 + i * 0.27;
    if (i === 0) ctx.moveTo(20 + Math.cos(angle) * r, 21 + Math.sin(angle) * r);
    else ctx.lineTo(20 + Math.cos(angle) * r, 21 + Math.sin(angle) * r);
  }
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = shell[2];
  ctx.stroke();
  shine(ctx, 14, 13, 4, 2, -0.6);
};

const mushroom = (cap: Palette): Paint => (ctx) => {
  for (const x of [17, 31]) {
    ellipse(ctx, x, 36.5, 4.5, 2.6);
    fillStroke(ctx, '#8A5A3C', 1.6);
  }
  roundRect(ctx, 12, 17, 24, 19, 8);
  fillStroke(ctx, linear(ctx, 12, 0, 36, 0, [[0, '#FFF6E4'], [0.6, '#F2DFC0'], [1, '#D4B88E']]), 2);
  eye(ctx, 21, 26, 2.8, 3.4);
  eye(ctx, 29, 26, 2.8, 3.4);
  smile(ctx, 25, 30, 2.2, 1.3);
  cheeks(ctx, [[16.5, 30.5], [33.5, 30.5]]);
  ctx.beginPath();
  ctx.moveTo(3, 20);
  ctx.quadraticCurveTo(4, 2, 24, 2);
  ctx.quadraticCurveTo(44, 2, 45, 20);
  ctx.quadraticCurveTo(40, 23.5, 34, 21);
  ctx.quadraticCurveTo(24, 24.5, 14, 21);
  ctx.quadraticCurveTo(8, 23.5, 3, 20);
  ctx.closePath();
  fillStroke(ctx, shade(ctx, 24, 10, 26, cap), 2.2);
  ctx.save();
  ctx.globalAlpha = 0.92;
  for (const [x, y, r] of [[14, 9, 3.6], [26, 6, 2.8], [35, 11, 3.4], [21, 15, 2.2], [40, 17, 1.8]]) {
    ellipse(ctx, x, y, r, r * 0.85);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
  }
  ctx.restore();
  shine(ctx, 10, 8, 4, 1.6, -0.6, 0.45);
};

const magma: Paint = (ctx) => {
  glow(ctx, 24, 24, 22, '#FF6A2A', 0.35);
  ctx.beginPath();
  ctx.moveTo(5, 37.5);
  ctx.quadraticCurveTo(2, 22, 12, 14);
  ctx.quadraticCurveTo(16, 6, 24, 8);
  ctx.quadraticCurveTo(33, 4, 37, 13);
  ctx.quadraticCurveTo(46, 20, 43, 37.5);
  ctx.quadraticCurveTo(24, 40, 5, 37.5);
  ctx.closePath();
  fillStroke(ctx, radial(ctx, 20, 18, 26, [[0, '#6A5A62'], [0.6, '#41343C'], [1, '#241A20']], 16, 12, 0), 2.2);
  const cracks: [number, number][][] = [[[11, 32], [16, 27], [14, 21]], [[35, 34], [31, 28], [36, 23], [34, 17]], [[21, 12], [25, 16]]];
  for (const [width, color] of [[2.4, '#FF8A1F'], [1, '#FFE07A']] as const) {
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    for (const crack of cracks) {
      ctx.beginPath();
      crack.forEach(([x, y], index) => { if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.stroke();
    }
  }
  ctx.beginPath();
  ctx.moveTo(18, 11);
  ctx.quadraticCurveTo(17, 3, 23, 0.6);
  ctx.quadraticCurveTo(23, 5, 26, 4);
  ctx.quadraticCurveTo(31, 6, 29.5, 11);
  ctx.closePath();
  fillStroke(ctx, linear(ctx, 0, 0, 0, 11, [[0, '#FFF3A0'], [0.5, '#FFB13D'], [1, '#FF5A2A']]), 1.4);
  for (const x of [21, 31]) {
    glow(ctx, x, 22, 5, '#FFB13D', 0.6);
    ellipse(ctx, x, 22, 3.4, 2.6);
    fillStroke(ctx, '#FFE07A', 1.2);
    ctx.fillStyle = INK;
    ctx.fillRect(x - 0.4, 20, 1.6, 4);
  }
  ctx.beginPath();
  ctx.moveTo(20, 29);
  ctx.quadraticCurveTo(26, 33, 32, 28.5);
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = '#FFB13D';
  ctx.stroke();
};

const puff = (wool: Palette, face: string): Paint => (ctx) => {
  for (const x of [13, 20, 30, 37]) {
    roundRect(ctx, x - 2, 29, 4, 9, 2);
    fillStroke(ctx, face, 1.4);
  }
  const blobs: [number, number, number][] = [[14, 22, 8], [22, 16, 9], [31, 17, 8.5], [24, 26, 10], [12, 28, 6.5], [34, 28, 7]];
  ctx.lineWidth = 4.4;
  ctx.strokeStyle = INK;
  for (const [x, y, r] of blobs) { ellipse(ctx, x, y, r, r); ctx.stroke(); }
  for (const [x, y, r] of blobs) { ellipse(ctx, x, y, r, r); ctx.fillStyle = shade(ctx, x, y, r, wool); ctx.fill(); }
  ellipse(ctx, 34, 14, 3.6, 2, 0.6);
  fillStroke(ctx, face, 1.3);
  ellipse(ctx, 39, 21, 7, 8);
  fillStroke(ctx, linear(ctx, 0, 13, 0, 29, [[0, '#7A6A80'], [1, face]]), 1.8);
  eye(ctx, 37.5, 19.5, 2, 2.4);
  eye(ctx, 42.2, 19.5, 1.9, 2.3);
  cheeks(ctx, [[41, 25]]);
};

const gearbot: Paint = (ctx) => {
  star(ctx, 12, 16, 10, 7.6, 8, 0);
  fillStroke(ctx, linear(ctx, 0, 6, 0, 26, [[0, '#C9D1DC'], [1, '#7E8A9C']]), 1.6);
  ellipse(ctx, 12, 16, 3.4, 3.4);
  fillStroke(ctx, '#4A5466', 1.2);
  roundRect(ctx, 8, 29.5, 32, 8.5, 4.2);
  fillStroke(ctx, '#3A3F4A', 1.8);
  for (const x of [14, 24, 34]) {
    ellipse(ctx, x, 33.8, 2.6, 2.6);
    fillStroke(ctx, '#8D97A8', 1);
  }
  const body = () => roundRect(ctx, 13, 11, 26, 20, 6);
  body();
  fillStroke(ctx, linear(ctx, 0, 11, 0, 31, [[0, '#F2F5F8'], [0.55, '#C2CAD6'], [1, '#808C9E']]), 2);
  clipped(ctx, body, () => {
    for (let x = 8; x < 44; x += 6) {
      path(ctx, [[x, 31], [x + 3, 26], [x + 6, 26], [x + 3, 31]]);
      ctx.fillStyle = '#FFD23F';
      ctx.fill();
    }
  });
  body();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  roundRect(ctx, 24, 14.5, 13, 8, 4);
  fillStroke(ctx, '#1E2430', 1.3);
  glow(ctx, 32, 18.5, 5, '#FF4A3D', 0.55);
  ellipse(ctx, 32, 18.5, 2.4, 2.4);
  ctx.fillStyle = '#FF6A5A';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(22, 11);
  ctx.lineTo(21, 4.5);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ellipse(ctx, 21, 4, 2.3, 2.3);
  fillStroke(ctx, '#FFD23F', 1.2);
};

const beetle = (shell: Palette): Paint => (ctx) => {
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = INK;
  for (const x of [13, 21, 29]) {
    ctx.beginPath();
    ctx.moveTo(x, 30);
    ctx.lineTo(x - 2.5, 37.5);
    ctx.stroke();
  }
  ellipse(ctx, 22, 23, 17, 12.5);
  fillStroke(ctx, radial(ctx, 18, 16, 24, [[0, shell[0]], [0.55, shell[1]], [1, shell[2]]], 14, 12, 0), 2.2);
  ctx.beginPath();
  ctx.moveTo(8, 25);
  ctx.quadraticCurveTo(22, 13, 37, 21);
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = shell[2];
  ctx.stroke();
  for (const [x, y, r] of [[16, 18, 2.4], [27, 17, 2], [21, 28, 1.8]]) {
    ellipse(ctx, x, y, r, r * 0.8);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fill();
  }
  shine(ctx, 15, 14, 6, 2.2, -0.35, 0.55);
  path(ctx, [[40, 21], [47, 9], [44.5, 23]]);
  fillStroke(ctx, linear(ctx, 0, 9, 0, 23, [[0, '#6A6478'], [1, '#2E2A3A']]), 1.5);
  ellipse(ctx, 38.5, 27, 7, 6.5);
  fillStroke(ctx, radial(ctx, 37, 25, 8, [[0, '#5A5468'], [1, '#2A2636']]), 1.8);
  eye(ctx, 40, 25.5, 2.2, 2.6);
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.moveTo(36, 32);
  ctx.lineTo(37, 37.5);
  ctx.stroke();
};

const imp: Paint = (ctx) => {
  ctx.beginPath();
  ctx.moveTo(11, 30);
  ctx.quadraticCurveTo(1, 30, 3, 19);
  ctx.lineWidth = 3.4;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = '#E8483A';
  ctx.stroke();
  path(ctx, [[3, 14], [0.5, 20.5], [6, 19.5]]);
  fillStroke(ctx, '#E8483A', 1.3);
  for (const x of [18, 30]) {
    ellipse(ctx, x, 36.5, 4.5, 2.5);
    fillStroke(ctx, '#7A1E14', 1.4);
  }
  for (const horn of [[[15, 16], [11, 3.5], [20, 12.5]], [[30, 12.5], [36, 3], [36, 15]]] as [number, number][][]) {
    path(ctx, horn);
    fillStroke(ctx, linear(ctx, 0, 3, 0, 16, [[0, '#FFF6D8'], [1, '#D9B48A']]), 1.5);
  }
  ellipse(ctx, 24, 25, 14, 12.5);
  fillStroke(ctx, shade(ctx, 24, 25, 16, ['#FF8A7A', '#E8483A', '#A82C2A']), 2.2);
  shine(ctx, 17, 19, 4, 2.4, -0.5, 0.35);
  eye(ctx, 23, 22, 3, 3.4);
  eye(ctx, 31, 22, 2.8, 3.2);
  ctx.beginPath();
  ctx.moveTo(19.5, 17.5); ctx.lineTo(25, 19.5);
  ctx.moveTo(34.5, 17.5); ctx.lineTo(29.5, 19.5);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(20, 28);
  ctx.quadraticCurveTo(27, 34, 34, 28);
  ctx.closePath();
  fillStroke(ctx, INK, 1);
  path(ctx, [[25, 28.6], [26.5, 31.6], [28, 28.8]]);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
};

const starling: Paint = (ctx) => {
  for (const x of [17, 31]) {
    ellipse(ctx, x, 37, 4, 2.4);
    fillStroke(ctx, '#D98A1C', 1.4);
  }
  glow(ctx, 24, 22, 20, '#FFE680', 0.4);
  star(ctx, 24, 22, 17, 9, 5);
  fillStroke(ctx, radial(ctx, 24, 22, 18, [[0, '#FFFBE0'], [0.55, '#FFE14A'], [1, '#E8A21C']], 20, 16, 0), 2.2);
  shine(ctx, 19, 13, 3, 1.6, -0.5);
  eye(ctx, 21, 22, 2.4, 3);
  eye(ctx, 28, 22, 2.4, 3);
  smile(ctx, 24.5, 25.5, 2.2, 1.3);
  cheeks(ctx, [[17.5, 27], [31.5, 27]]);
};

// ── Chargers ───────────────────────────────────────────────────────────────

const hedgehog: Paint = (ctx) => {
  const [light, base, dark] = ENEMY.hedgehog;
  for (let i = 0; i < 9; i++) {
    const angle = Math.PI * (0.95 + i * 0.07);
    const x = 22 + Math.cos(angle) * 15;
    const y = 24 + Math.sin(angle) * 12;
    const tipX = 22 + Math.cos(angle) * 25;
    const tipY = 24 + Math.sin(angle) * 22;
    path(ctx, [[x - Math.sin(angle) * 4.5, y + Math.cos(angle) * 4.5], [tipX, tipY], [x + Math.sin(angle) * 4.5, y - Math.cos(angle) * 4.5]]);
    fillStroke(ctx, linear(ctx, x, y, tipX, tipY, [[0, base], [1, dark]]), 1.6);
  }
  ellipse(ctx, 21, 25, 17, 11.5);
  fillStroke(ctx, radial(ctx, 21, 25, 18, [[0, light], [0.6, base], [1, dark]], 16, 20, 0), 2);
  ellipse(ctx, 34, 26, 10, 8.5);
  fillStroke(ctx, linear(ctx, 26, 18, 42, 34, [[0, '#FBE6C4'], [1, '#D9B48A']]), 1.8);
  ellipse(ctx, 43.5, 25.5, 2.6, 2.2);
  ctx.fillStyle = INK;
  ctx.fill();
  eye(ctx, 35, 22.5, 2.4, 2.8, 1);
  ctx.beginPath();
  ctx.moveTo(31.5, 19); ctx.lineTo(37.5, 20.5);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = INK;
  ctx.stroke();
  for (const x of [15, 29]) {
    ellipse(ctx, x, 35.5, 4, 2.4);
    fillStroke(ctx, dark, 1.4);
  }
};

const boar = (hide: Palette): Paint => (ctx) => {
  for (const x of [12, 19, 31, 38]) {
    roundRect(ctx, x, 28, 5, 10, 2);
    fillStroke(ctx, hide[2], 1.4);
  }
  ctx.beginPath();
  ctx.arc(7, 20, 2.6, Math.PI * 0.2, Math.PI * 1.7);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ellipse(ctx, 25, 23, 18, 12);
  fillStroke(ctx, shade(ctx, 25, 23, 20, hide), 2.2);
  ctx.beginPath();
  ctx.moveTo(11, 17);
  for (let i = 0; i < 6; i++) {
    ctx.lineTo(14 + i * 4, 8.5 + (i % 2) * 1.5);
    ctx.lineTo(16 + i * 4, 13.5);
  }
  ctx.lineTo(36, 15);
  ctx.closePath();
  fillStroke(ctx, hide[2], 1.4);
  path(ctx, [[36, 17], [38, 9.5], [41.5, 17]]);
  fillStroke(ctx, hide[1], 1.4);
  ellipse(ctx, 41, 24, 9, 8.5);
  fillStroke(ctx, shade(ctx, 41, 24, 10, hide), 2);
  ellipse(ctx, 48, 27, 4, 3.4);
  fillStroke(ctx, linear(ctx, 0, 23, 0, 31, [[0, '#FFD0BC'], [1, '#E09A80']]), 1.6);
  for (const x of [47, 49.5]) {
    ellipse(ctx, x, 27, 0.8, 1.1);
    ctx.fillStyle = INK;
    ctx.fill();
  }
  path(ctx, [[45, 31], [49.5, 25.5], [46.8, 31.6]]);
  fillStroke(ctx, '#FFFFFF', 1.2);
  eye(ctx, 42, 21.5, 2.2, 2.6);
  ctx.beginPath();
  ctx.moveTo(39.5, 18.3); ctx.lineTo(44.6, 19.6);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
};

const crab: Paint = (ctx) => {
  const red: Palette = ['#FFA08A', '#E8483A', '#A82C2A'];
  ctx.lineCap = 'round';
  for (const x of [15, 20, 25, 30, 35]) {
    ctx.beginPath();
    ctx.moveTo(x, 29);
    ctx.lineTo(x + (x < 25 ? -3 : 3), 37.5);
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = red[1];
    ctx.stroke();
  }
  for (const [x1, y1, x2, y2] of [[37, 24, 43, 16], [13, 24, 8, 17]]) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = red[1];
    ctx.stroke();
  }
  for (const [x, y, r, angle] of [[45, 11, 6.5, -0.6], [7, 13, 4.6, 0.6]]) {
    ellipse(ctx, x, y, r, r * 0.72, angle);
    fillStroke(ctx, shade(ctx, x, y, r, red), 1.8);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
  for (const [base, tip] of [[22, 20], [29, 30]]) {
    ctx.beginPath();
    ctx.moveTo(base, 17);
    ctx.lineTo(tip, 9);
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = INK;
    ctx.stroke();
    eye(ctx, tip, 8, 2.6, 3);
  }
  ellipse(ctx, 25, 25, 16, 9.5);
  fillStroke(ctx, shade(ctx, 25, 25, 17, red), 2.2);
  for (const [x, y] of [[18, 22], [25, 20], [31, 23]]) {
    glow(ctx, x, y, 3, '#FFB13D', 0.6);
    ellipse(ctx, x, y, 1.6, 1.2);
    ctx.fillStyle = '#FFE07A';
    ctx.fill();
  }
  smile(ctx, 27, 28, 2.4, 1.3);
};

const rhino = (hide: Palette): Paint => (ctx) => {
  for (const x of [13, 20, 32, 39]) {
    roundRect(ctx, x, 27, 6, 11, 2.5);
    fillStroke(ctx, hide[2], 1.4);
  }
  ellipse(ctx, 25, 22, 19, 13);
  fillStroke(ctx, shade(ctx, 25, 22, 21, hide), 2.2);
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = hide[2];
  for (const [x, r] of [[17, 10], [26, 11], [34, 9]]) {
    ctx.beginPath();
    ctx.arc(x, 24, r, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }
  path(ctx, [[46, 21], [53, 8], [50.5, 23]]);
  fillStroke(ctx, linear(ctx, 0, 8, 0, 23, [[0, '#FFFBEA'], [1, '#D9C8A0']]), 1.6);
  path(ctx, [[43.5, 18.5], [45.5, 12], [47.2, 19]]);
  fillStroke(ctx, '#F2E6C8', 1.3);
  ellipse(ctx, 42, 25, 10, 8.5);
  fillStroke(ctx, shade(ctx, 42, 25, 11, hide), 2);
  ellipse(ctx, 36, 15.5, 2.6, 4, -0.4);
  fillStroke(ctx, hide[1], 1.3);
  eye(ctx, 43.5, 22.5, 2, 2.4);
  ctx.beginPath();
  ctx.moveTo(41, 19.3); ctx.lineTo(46, 20.4);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ellipse(ctx, 50, 28, 0.9, 1.2);
  ctx.fillStyle = INK;
  ctx.fill();
};

const tank: Paint = (ctx) => {
  roundRect(ctx, 12, 1.5, 4.5, 9, 1.5);
  fillStroke(ctx, '#3A3F4A', 1.2);
  roundRect(ctx, 4, 27, 44, 11, 5.5);
  fillStroke(ctx, '#3A3F4A', 2);
  for (const x of [11, 20, 29, 38]) {
    ellipse(ctx, x, 32.5, 3.4, 3.4);
    fillStroke(ctx, '#8D97A8', 1);
  }
  const hull = () => path(ctx, [[8, 27.5], [12, 15], [40, 15], [46, 27.5]]);
  hull();
  fillStroke(ctx, linear(ctx, 0, 15, 0, 28, [[0, '#FFD08A'], [0.5, '#F0A040'], [1, '#B86A1C']]), 2);
  clipped(ctx, hull, () => {
    for (let x = 4; x < 50; x += 7) {
      path(ctx, [[x, 28], [x + 4, 22], [x + 7.5, 22], [x + 3.5, 28]]);
      ctx.fillStyle = 'rgba(43,34,54,0.75)';
      ctx.fill();
    }
  });
  hull();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  roundRect(ctx, 16, 6, 21, 11, 5);
  fillStroke(ctx, linear(ctx, 0, 6, 0, 17, [[0, '#E8ECF2'], [1, '#8D97A8']]), 1.8);
  roundRect(ctx, 27, 8.5, 9, 5.5, 2.7);
  fillStroke(ctx, '#1E2430', 1.2);
  glow(ctx, 32, 11.2, 4, '#FF4A3D', 0.6);
  ellipse(ctx, 32.5, 11.2, 1.8, 1.8);
  ctx.fillStyle = '#FF6A5A';
  ctx.fill();
  path(ctx, [[46, 19], [53, 23], [53, 36], [46, 34]]);
  fillStroke(ctx, linear(ctx, 46, 0, 53, 0, [[0, '#C9D1DC'], [1, '#6E7A8C']]), 1.6);
};

// ── Hoppers ────────────────────────────────────────────────────────────────

const frog = (skin: Palette): Paint => (ctx) => {
  ellipse(ctx, 10, 29.5, 8, 5.5, -0.3);
  fillStroke(ctx, skin[1], 1.8);
  ellipse(ctx, 8, 33.8, 5.5, 2);
  fillStroke(ctx, skin[2], 1.4);
  const body = () => ellipse(ctx, 23, 24, 15, 11);
  body();
  fillStroke(ctx, shade(ctx, 23, 24, 17, skin), 2.2);
  clipped(ctx, body, () => {
    ellipse(ctx, 27, 30, 10, 6);
    ctx.fillStyle = 'rgba(255,246,216,0.9)';
    ctx.fill();
    for (const [x, y] of [[14, 19], [19, 25], [12, 26]]) {
      ellipse(ctx, x, y, 2, 1.5);
      ctx.fillStyle = skin[2];
      ctx.fill();
    }
  });
  body();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ellipse(ctx, 33, 32, 4, 3.2);
  fillStroke(ctx, skin[1], 1.5);
  for (const [x, y, r] of [[24, 13, 5.6], [34, 13.5, 5.2]]) {
    ellipse(ctx, x, y, r, r);
    fillStroke(ctx, shade(ctx, x, y, r, skin), 1.8);
    eye(ctx, x + 0.6, y + 0.4, r * 0.62, r * 0.7);
  }
  ctx.beginPath();
  ctx.moveTo(27, 21.5);
  ctx.quadraticCurveTo(35, 26.5, 41.5, 19.5);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  cheeks(ctx, [[38, 23.5]]);
};

const bunny = (fur: Palette): Paint => (ctx) => {
  for (const [x, angle] of [[20, -0.3], [27, 0.12]]) {
    ellipse(ctx, x, 10, 3.9, 9.2, angle);
    fillStroke(ctx, shade(ctx, x, 10, 9, fur), 1.7);
    ellipse(ctx, x + 0.2, 11, 1.7, 6.4, angle);
    ctx.fillStyle = '#FFB3C7';
    ctx.fill();
  }
  ellipse(ctx, 8, 27, 4.2, 4.2);
  fillStroke(ctx, '#FFFFFF', 1.5);
  ellipse(ctx, 21, 28, 14, 10.5);
  fillStroke(ctx, shade(ctx, 21, 28, 16, fur), 2.2);
  ellipse(ctx, 31, 21, 9.5, 8.5);
  fillStroke(ctx, shade(ctx, 31, 21, 10, fur), 2);
  eye(ctx, 33, 19.5, 2.3, 2.9);
  ellipse(ctx, 39.6, 22.4, 1.6, 1.2);
  ctx.fillStyle = '#FF7FA0';
  ctx.fill();
  cheeks(ctx, [[36, 25]]);
  for (const x of [17, 29]) {
    ellipse(ctx, x, 37, 6, 2.4);
    fillStroke(ctx, fur[1], 1.4);
  }
};

// ── Flyers (body centred on its pivot, wings or rotors separate) ───────────

const batBody = (palette: Palette): Paint => (ctx) => {
  const [light, base, dark] = palette;
  for (const [x, dir] of [[9, -1], [21, 1]] as const) {
    path(ctx, [[x - 4, 9], [x + dir * 2, 1], [x + 4, 8]]);
    fillStroke(ctx, base, 1.6);
  }
  ellipse(ctx, 15, 15, 11, 10);
  fillStroke(ctx, radial(ctx, 15, 15, 12, [[0, light], [0.6, base], [1, dark]], 11, 11, 0), 2);
  ellipse(ctx, 15, 19, 6, 4.5);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fill();
  for (const x of [11, 19]) {
    ellipse(ctx, x, 13, 2.8, 3);
    fillStroke(ctx, '#FFE07A', 1);
    ctx.fillStyle = INK;
    ctx.fillRect(x - 0.6, 11, 1.2, 4);
  }
  ctx.beginPath();
  ctx.moveTo(8, 9.5); ctx.lineTo(13, 11); ctx.moveTo(22, 9.5); ctx.lineTo(17, 11);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = '#FFFFFF';
  for (const x of [13, 17]) {
    path(ctx, [[x - 1.3, 19], [x, 22.5], [x + 1.3, 19]]);
    ctx.fill();
  }
};

const batWing = (palette: Palette): Paint => (ctx) => {
  const [light, base, dark] = palette;
  ctx.beginPath();
  ctx.moveTo(2, 8);
  ctx.quadraticCurveTo(12, 0, 24, 2);
  ctx.quadraticCurveTo(22, 9, 24, 15);
  ctx.quadraticCurveTo(19, 12, 16, 17);
  ctx.quadraticCurveTo(12, 12, 8, 16);
  ctx.quadraticCurveTo(5, 11, 2, 12);
  ctx.closePath();
  fillStroke(ctx, linear(ctx, 2, 0, 24, 16, [[0, base], [1, dark]]), 1.8);
  ctx.beginPath();
  ctx.moveTo(3, 9); ctx.lineTo(16, 16); ctx.moveTo(3, 9); ctx.lineTo(23, 3);
  ctx.lineWidth = 1;
  ctx.strokeStyle = light;
  ctx.stroke();
};

const beeBody: Paint = (ctx) => {
  path(ctx, [[2, 15], [7, 12.5], [7, 17.5]]);
  fillStroke(ctx, INK, 1);
  const body = () => ellipse(ctx, 15, 15.5, 11.5, 9.5);
  body();
  fillStroke(ctx, radial(ctx, 13, 12, 13, [[0, '#FFF3A0'], [0.6, '#FFD23F'], [1, '#E8A21C']]), 2);
  clipped(ctx, body, () => {
    for (const x of [8, 15]) {
      ctx.fillStyle = '#3A2E2A';
      ctx.fillRect(x, 4, 3.6, 24);
    }
  });
  body();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  for (const [base, tipX, tipY] of [[24, 25, 2], [27.5, 30.5, 3.5]]) {
    ctx.beginPath();
    ctx.moveTo(base, 8);
    ctx.lineTo(tipX, tipY);
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ellipse(ctx, tipX, tipY, 1.6, 1.6);
    ctx.fillStyle = INK;
    ctx.fill();
  }
  ellipse(ctx, 25.5, 14, 6.5, 6.5);
  fillStroke(ctx, radial(ctx, 24, 12, 7, [[0, '#FFF6C2'], [1, '#FFD23F']]), 1.8);
  eye(ctx, 27.2, 13, 2.3, 2.8);
  smile(ctx, 27, 16.5, 1.6, 1.1);
  cheeks(ctx, [[23, 17.5]]);
};

const beeWing: Paint = (ctx) => {
  ellipse(ctx, 11, 7, 9, 4.6, 0.35);
  fillStroke(ctx, 'rgba(220,245,255,0.8)', 1.3, '#4A6A8A');
  ctx.beginPath();
  ctx.moveTo(19, 11);
  ctx.lineTo(6, 4.5);
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = 'rgba(74,106,138,0.6)';
  ctx.stroke();
};

const wisp = (flame: Palette): Paint => (ctx) => {
  glow(ctx, 20, 15, 16, flame[1], 0.45);
  ctx.beginPath();
  ctx.moveTo(23, 6);
  ctx.quadraticCurveTo(9, 3, 1, 9);
  ctx.quadraticCurveTo(8, 11.5, 4, 15.5);
  ctx.quadraticCurveTo(10, 17, 2.5, 23);
  ctx.quadraticCurveTo(14, 26.5, 23, 24);
  ctx.closePath();
  fillStroke(ctx, linear(ctx, 24, 0, 1, 0, [[0, flame[0]], [0.5, flame[1]], [1, flame[2]]]), 1.6);
  ellipse(ctx, 20.5, 15, 9.5, 9.5);
  fillStroke(ctx, radial(ctx, 19, 12, 11, [[0, '#FFFBE0'], [0.5, flame[0]], [1, flame[1]]]), 2);
  eye(ctx, 21.5, 13.5, 2.2, 2.8);
  eye(ctx, 26.5, 13.5, 2, 2.6);
  smile(ctx, 24, 17.5, 1.8, 1.2);
};

const birdBody = (feather: Palette): Paint => (ctx) => {
  path(ctx, [[7, 14], [0.5, 9], [2, 15.5], [0.5, 21], [7, 17.5]]);
  fillStroke(ctx, feather[2], 1.5);
  for (const [x, tip] of [[13, 10], [16, 13]]) {
    ctx.beginPath();
    ctx.moveTo(x, 6.5);
    ctx.quadraticCurveTo(x - 3, 2, x - 1.5 + tip / 10, 0.8);
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = feather[1];
    ctx.stroke();
  }
  const body = () => ellipse(ctx, 15, 15, 11, 10);
  body();
  fillStroke(ctx, shade(ctx, 15, 15, 12, feather), 2);
  clipped(ctx, body, () => {
    ellipse(ctx, 18, 21, 8, 5.5);
    ctx.fillStyle = 'rgba(255,246,228,0.95)';
    ctx.fill();
  });
  body();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  path(ctx, [[25, 12.5], [31.5, 15.5], [25, 18.5]]);
  fillStroke(ctx, linear(ctx, 0, 12, 0, 19, [[0, '#FFD07A'], [1, '#F08A1F']]), 1.4);
  eye(ctx, 21.5, 12.5, 2.4, 2.8);
  cheeks(ctx, [[21, 17.5]]);
};

const birdWing = (feather: Palette): Paint => (ctx) => {
  ctx.beginPath();
  ctx.moveTo(21, 12);
  ctx.quadraticCurveTo(12, 0.5, 1, 3);
  ctx.quadraticCurveTo(5, 7, 2, 9);
  ctx.quadraticCurveTo(8, 10, 5, 13);
  ctx.quadraticCurveTo(13, 15.5, 21, 12);
  ctx.closePath();
  fillStroke(ctx, linear(ctx, 21, 0, 1, 0, [[0, feather[0]], [1, feather[2]]]), 1.6);
};

const ghost = (sheet: Palette): Paint => (ctx) => {
  glow(ctx, 16, 14, 16, sheet[0], 0.3);
  ctx.beginPath();
  ctx.moveTo(4, 26);
  ctx.lineTo(4, 13);
  ctx.quadraticCurveTo(4, 2, 16, 2);
  ctx.quadraticCurveTo(28, 2, 28, 13);
  ctx.lineTo(28, 26);
  for (const x of [22, 16, 10, 4]) ctx.quadraticCurveTo(x + 3, 30, x, 26);
  ctx.closePath();
  fillStroke(ctx, linear(ctx, 0, 2, 0, 28, [[0, sheet[0]], [1, sheet[1]]]), 2);
  for (const [x, angle] of [[4, 0.5], [28, -0.5]]) {
    ellipse(ctx, x, 17, 3, 2.2, angle);
    fillStroke(ctx, sheet[0], 1.4);
  }
  for (const x of [14, 21]) {
    ellipse(ctx, x, 12, 2.2, 3.2);
    ctx.fillStyle = INK;
    ctx.fill();
    ellipse(ctx, x - 0.6, 10.8, 0.8, 0.8);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
  }
  ellipse(ctx, 17.5, 18.5, 2, 2.6);
  ctx.fillStyle = INK;
  ctx.fill();
  cheeks(ctx, [[10.5, 16.5], [24.5, 16.5]]);
};

const droneBody: Paint = (ctx) => {
  for (const [x1, x2] of [[12, 8], [22, 26]]) {
    ctx.beginPath();
    ctx.moveTo(x1, 10);
    ctx.lineTo(x2, 5);
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = '#8D97A8';
    ctx.stroke();
    ellipse(ctx, x2, 5, 1.8, 1.8);
    fillStroke(ctx, '#4A5466', 1);
  }
  ctx.beginPath();
  ctx.moveTo(10, 21); ctx.lineTo(9, 24.5); ctx.lineTo(25, 24.5); ctx.lineTo(24, 21);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  const body = () => roundRect(ctx, 6, 9, 22, 13, 6.5);
  body();
  fillStroke(ctx, linear(ctx, 0, 9, 0, 22, [[0, '#F2F5F8'], [1, '#8D97A8']]), 2);
  clipped(ctx, body, () => {
    ctx.fillStyle = '#FFD23F';
    ctx.fillRect(0, 18, 40, 2);
  });
  ellipse(ctx, 20, 15, 5.5, 4.5);
  fillStroke(ctx, '#1E2430', 1.4);
  glow(ctx, 21, 15, 4.5, '#FF4A3D', 0.6);
  ellipse(ctx, 21.4, 15, 2, 2);
  ctx.fillStyle = '#FF6A5A';
  ctx.fill();
};

const rotor: Paint = (ctx) => {
  ellipse(ctx, 11, 3, 10, 2);
  fillStroke(ctx, 'rgba(210,220,232,0.85)', 1.1);
  ellipse(ctx, 11, 3, 1.6, 1.6);
  ctx.fillStyle = '#4A5466';
  ctx.fill();
};

// ── Registry ───────────────────────────────────────────────────────────────

const GREEN: Palette = ENEMY.slime as unknown as Palette;
const ground = (id: string, width: number, height: number, paint: Paint, feet = height - 2): Species => ({ id, body: { width, height, ox: width / 2, oy: feet, paint } });
const flyer = (id: string, width: number, height: number, paint: Paint, wings?: Omit<Wings, 'ox' | 'oy'> & { pivot: [number, number] }): Species => ({
  id,
  body: { width, height, ox: width / 2, oy: height / 2 + 1, paint },
  wings: wings && { ...wings, ox: wings.pivot[0], oy: wings.pivot[1] },
});
const batWings = (palette: Palette) => ({ width: 26, height: 20, pivot: [2, 8] as [number, number], paint: batWing(palette), anchors: [[-8, -2, true], [8, -2, false]] as [number, number, boolean][], motion: 'flap' as const, amp: 32, speed: 18 });
const birdWings = (palette: Palette) => ({ width: 24, height: 16, pivot: [21, 12] as [number, number], paint: birdWing(palette), anchors: [[0, -1, false]] as [number, number, boolean][], motion: 'flap' as const, amp: 38, speed: 14 });

export const SPECIES: Record<string, Species> = Object.fromEntries([
  ground('slime', 44, 36, slime(GREEN)),
  ground('slime-violet', 44, 36, slime(['#E2C8FF', '#A87AE8', '#6A4AB0'])),
  ground('slime-cosmic', 44, 36, slime(['#B8E8FF', '#5A8AE8', '#2E3A9A'])),
  ground('snail', 48, 40, snail(['#FFD9A8', '#F0A050', '#B8642A'])),
  ground('snail-sky', 48, 40, snail(['#D8F0FF', '#7FC4F0', '#3F86C0'])),
  ground('mushroom', 48, 40, mushroom(['#FF9A8A', '#E8483A', '#A82C2A'])),
  ground('mushroom-blue', 48, 40, mushroom(['#A8E0FF', '#3FA0E8', '#2A62A8'])),
  ground('mushroom-violet', 48, 40, mushroom(['#E8C8FF', '#9A5AD8', '#5E3296'])),
  ground('magma', 48, 40, magma),
  ground('puff', 48, 40, puff(['#FFFFFF', '#F2F0F8', '#CBC6DA'], '#4A3F55')),
  ground('puff-pink', 48, 40, puff(['#FFFFFF', '#FFE2EE', '#E8B4C8'], '#6A3F55')),
  ground('gearbot', 48, 40, gearbot),
  ground('beetle', 48, 40, beetle(['#9CF6E0', '#2EB8A0', '#1E5E7A'])),
  ground('beetle-violet', 48, 40, beetle(['#F0B8FF', '#A84AD8', '#4A2286'])),
  ground('imp', 48, 40, imp),
  ground('starling', 48, 40, starling),
  ground('hedgehog', 48, 38, hedgehog, 37),
  ground('boar', 54, 40, boar(['#D8A27A', '#9A6A45', '#5C3B27'])),
  ground('boar-shadow', 54, 40, boar(['#9A8AB8', '#5A4E78', '#2E2648'])),
  ground('crab', 52, 40, crab),
  ground('rhino', 56, 40, rhino(['#D8DCE6', '#9AA2B4', '#5E667A'])),
  ground('rhino-cloud', 56, 40, rhino(['#FFFFFF', '#DDE8F8', '#A8B8D8'])),
  ground('rhino-cosmic', 56, 40, rhino(['#B8C8FF', '#5A6AC8', '#2A3478'])),
  ground('tank', 56, 40, tank),
  ground('frog', 44, 36, frog(['#C8F07A', '#6EC84A', '#3A8A30'])),
  ground('frog-teal', 44, 36, frog(['#A8F0E0', '#3EC4A8', '#22806E'])),
  ground('frog-lava', 44, 36, frog(['#FFD08A', '#FF7A3D', '#B83A1C'])),
  ground('frog-violet', 44, 36, frog(['#E2C8FF', '#9A6AD8', '#5A3A96'])),
  ground('bunny', 44, 40, bunny(['#FFFFFF', '#F4F0FA', '#CFC8DE'])),
  ground('bunny-pink', 44, 40, bunny(['#FFFFFF', '#FFE0EC', '#E8AFC6'])),
  ground('bunny-star', 44, 40, bunny(['#FFF6C2', '#FFE07A', '#D9A43A'])),
  flyer('bat', 30, 26, batBody(ENEMY.bat as unknown as Palette), batWings(ENEMY.bat as unknown as Palette)),
  flyer('bat-ember', 30, 26, batBody(['#FF9A7A', '#C83A2A', '#7A1E14']), batWings(['#FF9A7A', '#C83A2A', '#7A1E14'])),
  flyer('bee', 32, 28, beeBody, { width: 22, height: 14, pivot: [19, 12], paint: beeWing, anchors: [[-1, -6, false], [3, -7, false]], motion: 'flap', amp: 26, speed: 42 }),
  flyer('wisp', 32, 28, wisp(['#FFF3A0', '#FF8A1F', '#E8342A'])),
  flyer('wisp-blue', 32, 28, wisp(['#E0FAFF', '#5CC8FF', '#3A5AE8'])),
  flyer('bird', 32, 28, birdBody(['#BDEBFF', '#4FA8FF', '#2A62B8']), birdWings(['#BDEBFF', '#4FA8FF', '#2A62B8'])),
  flyer('bird-sun', 32, 28, birdBody(['#FFF3A0', '#FFC43D', '#D9861C']), birdWings(['#FFF3A0', '#FFC43D', '#D9861C'])),
  flyer('bird-jungle', 32, 28, birdBody(['#C8F07A', '#3EB86A', '#1E7A4A']), birdWings(['#FFB0A0', '#FF5A6A', '#B8283A'])),
  flyer('ghost', 32, 30, ghost(['#FFFFFF', '#D8D2EE', '#8A80B0'])),
  flyer('ghost-cosmic', 32, 30, ghost(['#E0F0FF', '#9AB8F8', '#4A5AB0'])),
  flyer('drone', 34, 26, droneBody, { width: 22, height: 6, pivot: [11, 3], paint: rotor, anchors: [[-9, -9, false], [9, -9, false]], motion: 'spin', amp: 1, speed: 40 }),
].map((species) => [species.id, species]));

// Each world's cast per behaviour; a stage alternates within each list.
const ROSTERS: Record<EnemyKind, string[]>[] = [
  { patrol: ['slime', 'snail'], fly: ['bat', 'bee'], charger: ['hedgehog'], hopper: ['frog'] },
  { patrol: ['mushroom', 'mushroom-blue'], fly: ['bee', 'bat'], charger: ['boar'], hopper: ['frog-teal'] },
  { patrol: ['magma'], fly: ['wisp', 'bat-ember'], charger: ['crab'], hopper: ['frog-lava'] },
  { patrol: ['puff', 'snail-sky'], fly: ['bird'], charger: ['rhino'], hopper: ['bunny'] },
  { patrol: ['mushroom-violet', 'slime-violet'], fly: ['ghost'], charger: ['boar-shadow'], hopper: ['frog-violet'] },
  { patrol: ['gearbot'], fly: ['drone'], charger: ['tank'], hopper: ['gearbot'] },
  { patrol: ['puff-pink'], fly: ['bird-sun', 'bee'], charger: ['rhino-cloud'], hopper: ['bunny-pink'] },
  { patrol: ['beetle', 'snail'], fly: ['bee', 'bird-jungle'], charger: ['boar'], hopper: ['frog'] },
  { patrol: ['imp'], fly: ['wisp', 'bat-ember'], charger: ['tank'], hopper: ['imp'] },
  { patrol: ['starling', 'slime-cosmic'], fly: ['ghost-cosmic', 'wisp-blue'], charger: ['rhino-cosmic'], hopper: ['bunny-star'] },
];

export const rosterFor = (world: number) => ROSTERS[Math.min(ROSTERS.length, Math.max(1, world)) - 1];

// The `index`-th monster of this behaviour in a stage of `world`.
export function speciesFor(kind: EnemyKind, world: number, index: number) {
  const list = rosterFor(world)[kind];
  return SPECIES[list[index % list.length]];
}

export const speciesKey = (species: Species, part: 'body' | 'wing') => `monster-${species.id}${part === 'wing' ? '-wing' : ''}`;

export function bakeSpecies(scene: Phaser.Scene, species: Species) {
  bake(scene, speciesKey(species, 'body'), species.body.width, species.body.height, species.body.paint);
  if (species.wings) bake(scene, speciesKey(species, 'wing'), species.wings.width, species.wings.height, species.wings.paint);
}
