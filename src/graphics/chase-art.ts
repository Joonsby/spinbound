import Phaser from 'phaser';
import { bake, clipped, ellipse, fillStroke, glow, linear, radial, roundRect } from './art';
import { INK } from './palette';

// TEMPORARY ART: the giant dragon of chase stages (body, jaw and wing move separately) and the
// coin thief of pursuit stages. The dragon faces right; its snout tip is the body's pivot.

type Ctx = CanvasRenderingContext2D;

export const CHASE_KEYS = {
  dragonBody: 'chase-dragon-body',
  dragonJaw: 'chase-dragon-jaw',
  dragonWing: 'chase-dragon-wing',
  thief: 'chase-thief',
};

// Pivots in each texture's logical px.
export const DRAGON = {
  body: { width: 300, height: 200, ox: 296, oy: 90 },
  jaw: { width: 130, height: 50, ox: 8, oy: 8, x: -104, y: 12 },
  wing: { width: 230, height: 170, ox: 205, oy: 160, x: -190, y: 40 },
};

const SCALE: [number, string][] = [[0, '#FF8A6A'], [0.55, '#D8342A'], [1, '#7A141A']];

function polygon(ctx: Ctx, points: [number, number][]) {
  ctx.beginPath();
  points.forEach(([x, y], index) => { if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  ctx.closePath();
}

function paintDragonBody(ctx: Ctx) {
  // Back spikes along the neck, behind it.
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const x = 20 + t * 120;
    const y = 168 - t * 64 - Math.sin(t * Math.PI) * 18;
    polygon(ctx, [[x - 9, y + 6], [x - 14 + t * 6, y - 22 + t * 4], [x + 10, y + 4]]);
    fillStroke(ctx, linear(ctx, 0, y - 22, 0, y + 6, [[0, '#FFE0A0'], [1, '#D9A04A']]), 2.4);
  }
  const neck = () => {
    ctx.beginPath();
    ctx.moveTo(0, 200);
    ctx.bezierCurveTo(30, 150, 80, 112, 160, 98);
    ctx.lineTo(178, 150);
    ctx.bezierCurveTo(112, 162, 62, 184, 44, 200);
    ctx.closePath();
  };
  neck();
  ctx.fillStyle = linear(ctx, 0, 100, 0, 200, SCALE);
  ctx.fill();
  clipped(ctx, neck, () => {
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      ellipse(ctx, 56 + t * 110, 196 - t * 48, 16, 9, -0.55);
      fillStroke(ctx, linear(ctx, 0, 140, 0, 200, [[0, '#FFE8B8'], [1, '#E8B060']]), 1.6);
    }
  });
  neck();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // Horns sweep back over the neck.
  for (const [base, tip, width] of [[[178, 50], [104, 6], 14], [[206, 44], [150, 0], 11]] as const) {
    ctx.beginPath();
    ctx.moveTo(base[0] - width / 2, base[1] + 6);
    ctx.quadraticCurveTo(base[0] - 30, base[1] - 30, tip[0], tip[1]);
    ctx.quadraticCurveTo(base[0] - 12, base[1] - 20, base[0] + width / 2, base[1] + 4);
    ctx.closePath();
    fillStroke(ctx, linear(ctx, tip[0], tip[1], base[0], base[1], [[0, '#FFFBEA'], [1, '#C8A070']]), 2.4);
  }
  // Frill behind the jaw.
  polygon(ctx, [[150, 70], [118, 62], [140, 84], [112, 92], [146, 100], [124, 116], [160, 110]]);
  fillStroke(ctx, linear(ctx, 110, 0, 160, 0, [[0, '#FFB13D'], [1, '#D8342A']]), 2.2);
  // Head with the upper jaw; the lower jaw is its own part.
  const head = () => {
    ctx.beginPath();
    ctx.moveTo(142, 96);
    ctx.quadraticCurveTo(146, 40, 202, 40);
    ctx.quadraticCurveTo(242, 42, 264, 60);
    ctx.quadraticCurveTo(292, 70, 298, 88);
    ctx.quadraticCurveTo(298, 101, 282, 102);
    ctx.lineTo(196, 104);
    ctx.quadraticCurveTo(160, 120, 142, 96);
    ctx.closePath();
  };
  head();
  ctx.fillStyle = radial(ctx, 200, 60, 110, SCALE, 190, 50, 0);
  ctx.fill();
  clipped(ctx, head, () => {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ellipse(ctx, 210, 50, 40, 9, -0.05);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(122,20,26,0.35)';
    ctx.fillRect(130, 94, 180, 20);
  });
  head();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  for (let x = 204; x < 282; x += 13) {
    polygon(ctx, [[x, 102], [x + 5.5, 115], [x + 11, 102]]);
    fillStroke(ctx, '#FFFFFF', 1.6);
  }
  // Brow ridge and glowing eye.
  glow(ctx, 228, 64, 20, '#FFB13D', 0.55);
  ellipse(ctx, 228, 65, 12, 8, -0.15);
  fillStroke(ctx, radial(ctx, 228, 65, 12, [[0, '#FFFBE0'], [0.5, '#FFE07A'], [1, '#FF8A1F']]), 2);
  roundRect(ctx, 226.5, 57.5, 4, 15, 2);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(208, 52);
  ctx.quadraticCurveTo(230, 46, 250, 58);
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#5A0E12';
  ctx.stroke();
  ellipse(ctx, 284, 80, 4, 2.6, -0.4);
  ctx.fillStyle = '#3A0A0E';
  ctx.fill();
}

function paintDragonJaw(ctx: Ctx) {
  const jaw = () => {
    ctx.beginPath();
    ctx.moveTo(4, 4);
    ctx.lineTo(118, 10);
    ctx.quadraticCurveTo(128, 16, 116, 26);
    ctx.quadraticCurveTo(62, 42, 8, 30);
    ctx.closePath();
  };
  jaw();
  ctx.fillStyle = linear(ctx, 0, 4, 0, 40, [[0, '#E8483A'], [1, '#7A141A']]);
  ctx.fill();
  clipped(ctx, jaw, () => {
    ellipse(ctx, 70, 12, 46, 5);
    ctx.fillStyle = '#FF7A8A';
    ctx.fill();
  });
  jaw();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  for (let x = 30; x < 112; x += 14) {
    polygon(ctx, [[x, 9], [x + 5.5, -1], [x + 11, 9.5]]);
    fillStroke(ctx, '#FFFFFF', 1.5);
  }
}

function paintDragonWing(ctx: Ctx) {
  const shoulder: [number, number] = [205, 160];
  const fingers: [number, number][] = [[150, 4], [80, 18], [26, 60], [6, 120]];
  ctx.beginPath();
  ctx.moveTo(...shoulder);
  ctx.lineTo(...fingers[0]);
  for (let i = 1; i < fingers.length; i++) {
    const [px, py] = fingers[i - 1];
    const [x, y] = fingers[i];
    ctx.quadraticCurveTo((px + x) / 2 + 14, (py + y) / 2 + 22, x, y);
  }
  ctx.quadraticCurveTo(90, 120, shoulder[0], shoulder[1]);
  ctx.closePath();
  fillStroke(ctx, linear(ctx, 0, 0, 0, 170, [[0, '#A8283A'], [1, '#5A0E1E']]), 3);
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#3A0A12';
  for (const [x, y] of fingers) {
    ctx.beginPath();
    ctx.moveTo(...shoulder);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  for (const [x, y] of fingers) {
    ellipse(ctx, x, y, 4, 4);
    fillStroke(ctx, '#FFE8B8', 1.6);
  }
}

function paintThief(ctx: Ctx) {
  // Coin sack over the back shoulder.
  ellipse(ctx, 13, 17, 12, 11);
  fillStroke(ctx, radial(ctx, 10, 13, 13, [[0, '#E8C890'], [1, '#A87A44']]), 2);
  ctx.fillStyle = '#FFD24A';
  for (const [x, y] of [[9, 9], [15, 7], [12, 4.5]]) {
    ellipse(ctx, x, y, 3.4, 2.4);
    fillStroke(ctx, '#FFD24A', 1.2);
  }
  roundRect(ctx, 8, 14, 10, 3, 1.5);
  ctx.fillStyle = '#7A5A30';
  ctx.fill();
  for (const x of [20, 32]) {
    ellipse(ctx, x, 45.5, 5, 2.6);
    fillStroke(ctx, '#3A3446', 1.4);
  }
  // Striped tail.
  ctx.beginPath();
  ctx.moveTo(14, 36);
  ctx.quadraticCurveTo(2, 38, 4, 28);
  ctx.lineWidth = 7;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = 4.4;
  ctx.strokeStyle = '#9AA2B4';
  ctx.stroke();
  const body = () => ellipse(ctx, 26, 34, 12, 11);
  body();
  fillStroke(ctx, radial(ctx, 24, 30, 14, [[0, '#C9D1DC'], [1, '#6E7A8C']]), 2.2);
  // Head with the bandit mask.
  ellipse(ctx, 31, 18, 12, 10.5);
  fillStroke(ctx, radial(ctx, 29, 14, 13, [[0, '#E2E8F0'], [1, '#8D97A8']]), 2.2);
  for (const [x, angle] of [[22, -0.4], [36, 0.3]]) {
    ellipse(ctx, x, 9, 4, 5, angle);
    fillStroke(ctx, '#8D97A8', 1.6);
  }
  roundRect(ctx, 23, 13.5, 20, 7, 3.5);
  fillStroke(ctx, '#2B2236', 1);
  for (const x of [29, 37.5]) {
    ellipse(ctx, x, 17, 2.4, 2.4);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ellipse(ctx, x + 0.6, 17.2, 1.2, 1.2);
    ctx.fillStyle = INK;
    ctx.fill();
  }
  ellipse(ctx, 42.5, 21.5, 2.2, 1.8);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(37, 23.5, 3, 0.1 * Math.PI, 0.8 * Math.PI);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

export function createChaseArt(scene: Phaser.Scene) {
  bake(scene, CHASE_KEYS.dragonBody, DRAGON.body.width, DRAGON.body.height, paintDragonBody);
  bake(scene, CHASE_KEYS.dragonJaw, DRAGON.jaw.width, DRAGON.jaw.height, paintDragonJaw);
  bake(scene, CHASE_KEYS.dragonWing, DRAGON.wing.width, DRAGON.wing.height, paintDragonWing);
  bake(scene, CHASE_KEYS.thief, 52, 48, paintThief);
}
