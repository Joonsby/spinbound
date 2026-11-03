import Phaser from 'phaser';
import { bake, clipped, ellipse, fillStroke, glow, linear, radial, roundRect } from './art';
import { INK } from './palette';

// TEMPORARY ART: the giant dragon of chase stages and the coin thief of pursuit stages.
// The dragon is a whole side-on beast facing right (tail, legs and all), built from parts that move
// separately: body, lower jaw and wing (the far wing reuses it, darker). The snout tip is the body's pivot.

type Ctx = CanvasRenderingContext2D;
type Point = [number, number];

export const CHASE_KEYS = {
  dragonBody: 'chase-dragon-body',
  dragonJaw: 'chase-dragon-jaw',
  dragonWing: 'chase-dragon-wing',
  thief: 'chase-thief',
};

// Pivots in each texture's logical px; x/y place a part relative to the snout tip.
export const DRAGON = {
  body: { width: 480, height: 232, ox: 476, oy: 86 },
  jaw: { width: 126, height: 46, ox: 10, oy: 14, x: -110, y: 16 },
  wing: { width: 290, height: 210, ox: 262, oy: 192, x: -238, y: 14 },
};

const SCALE: [number, string][] = [[0, '#FF8A6A'], [0.5, '#D8342A'], [1, '#7A141A']];
const DEEP: [number, string][] = [[0, '#A8283A'], [1, '#4A0A14']];
const BELLY = '#FFE3A8';
const HORN: [number, string][] = [[0, '#FFFBEA'], [1, '#C8A070']];

function polygon(ctx: Ctx, points: Point[]) {
  ctx.beginPath();
  points.forEach(([x, y], index) => { if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  ctx.closePath();
}

// A curved horn, spike or claw: from a base edge (a to b) out to a tip, bowed by `bend`.
function spike(ctx: Ctx, a: Point, b: Point, tip: Point, bend = 0) {
  const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const nx = -(tip[1] - mid[1]) * bend;
  const ny = (tip[0] - mid[0]) * bend;
  ctx.beginPath();
  ctx.moveTo(...a);
  ctx.quadraticCurveTo((a[0] + tip[0]) / 2 + nx, (a[1] + tip[1]) / 2 + ny, ...tip);
  ctx.quadraticCurveTo((b[0] + tip[0]) / 2 + nx, (b[1] + tip[1]) / 2 + ny, ...b);
  ctx.closePath();
}

// Points and inward normals along a cubic curve, for the belly plates.
function along(p0: Point, p1: Point, p2: Point, p3: Point, steps: number) {
  return Array.from({ length: steps }, (_, i) => {
    const t = (i + 0.5) / steps;
    const u = 1 - t;
    const x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
    const y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
    const dx = 3 * u * u * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]);
    const dy = 3 * u * u * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]);
    const length = Math.hypot(dx, dy) || 1;
    return { x, y, nx: -dy / length, ny: dx / length };
  });
}

// Underside from the throat to the tail tip; the belly plates follow it.
const UNDERSIDE: [Point, Point, Point, Point, number][] = [
  [[358, 110], [336, 122], [312, 144], [296, 166], 34],
  [[296, 166], [284, 182], [268, 194], [246, 200], 34],
  [[246, 200], [206, 210], [158, 200], [128, 186], 30],
  [[128, 186], [104, 176], [80, 154], [58, 136], 20],
  [[58, 136], [40, 122], [28, 108], [16, 96], 12],
];

function bodyPath(ctx: Ctx) {
  ctx.beginPath();
  ctx.moveTo(352, 58);
  ctx.bezierCurveTo(330, 60, 302, 72, 280, 88);
  ctx.bezierCurveTo(258, 100, 222, 88, 186, 92);
  ctx.bezierCurveTo(158, 95, 136, 108, 118, 114);
  ctx.bezierCurveTo(92, 122, 64, 120, 44, 106);
  ctx.bezierCurveTo(34, 98, 26, 90, 18, 84);
  ctx.lineTo(16, 96);
  for (const [, c1, c2, end] of [...UNDERSIDE].reverse().map(([a, b, c, d, w]) => [d, c, b, a, w] as const)) ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], end[0], end[1]);
  ctx.closePath();
}

// Reaches forward, claws out; the claws go first so the paw covers their roots.
function frontLeg(ctx: Ctx, dx: number, dy: number, fill: CanvasGradient | string) {
  ctx.save();
  ctx.translate(dx, dy);
  for (const [base, tip] of [[[334, 198], [348, 212]], [[325, 202], [334, 218]], [[315, 205], [320, 221]]] as [Point, Point][]) {
    spike(ctx, [base[0] - 5, base[1] - 2], [base[0] + 4, base[1] + 2], tip, 0.18);
    fillStroke(ctx, '#FFF4DC', 1.8);
  }
  ctx.beginPath();
  ctx.moveTo(262, 150);
  ctx.bezierCurveTo(278, 144, 298, 156, 302, 174);
  ctx.bezierCurveTo(306, 184, 314, 186, 326, 186);
  ctx.bezierCurveTo(336, 186, 342, 192, 340, 200);
  ctx.lineTo(318, 206);
  ctx.bezierCurveTo(306, 208, 292, 206, 284, 200);
  ctx.bezierCurveTo(274, 192, 264, 182, 258, 168);
  ctx.closePath();
  fillStroke(ctx, fill, 2.6);
  ctx.restore();
}

function hindLeg(ctx: Ctx, dx: number, dy: number, fill: CanvasGradient | string) {
  ctx.save();
  ctx.translate(dx, dy);
  for (const [base, tip] of [[[166, 212], [178, 222]], [[158, 214], [165, 225]], [[149, 214], [152, 225]]] as [Point, Point][]) {
    spike(ctx, [base[0] - 5, base[1] - 2], [base[0] + 4, base[1] + 1], tip, 0.18);
    fillStroke(ctx, '#FFF4DC', 1.8);
  }
  ctx.beginPath();
  ctx.moveTo(126, 178);
  ctx.bezierCurveTo(130, 196, 138, 202, 144, 208);
  ctx.bezierCurveTo(150, 214, 160, 216, 170, 214);
  ctx.lineTo(171, 205);
  ctx.bezierCurveTo(163, 203, 158, 197, 160, 186);
  ctx.closePath();
  fillStroke(ctx, fill, 2.6);
  ellipse(ctx, 146, 168, 32, 25, -0.35);
  fillStroke(ctx, fill, 2.6);
  ctx.restore();
}

function paintDragonBody(ctx: Ctx) {
  // Far legs first, darker, so the near ones read in front.
  frontLeg(ctx, 18, -6, linear(ctx, 0, 140, 0, 220, DEEP));
  hindLeg(ctx, 18, -6, linear(ctx, 0, 140, 0, 220, DEEP));
  // Back spines, tallest at the shoulders; the body covers their bases.
  const spines: [number, number, number][] = [[340, 62, 16], [318, 68, 19], [296, 78, 21], [270, 90, 22], [244, 92, 21], [218, 89, 20], [192, 90, 18], [166, 95, 16], [140, 104, 14], [112, 114, 12], [86, 118, 11], [62, 114, 9], [42, 104, 8]];
  for (const [x, y, size] of spines) {
    spike(ctx, [x - size * 0.55, y + 6], [x + size * 0.45, y + 4], [x - size * 0.5, y - size], -0.1);
    fillStroke(ctx, linear(ctx, 0, y - size, 0, y + 6, [[0, '#FFE6A8'], [1, '#D9963A']]), 2.2);
  }
  // Spade at the tail tip.
  polygon(ctx, [[22, 84], [8, 70], [0, 82], [6, 92], [20, 98]]);
  fillStroke(ctx, linear(ctx, 0, 70, 0, 98, [[0, '#FFE6A8'], [1, '#D9963A']]), 2.4);
  // Body: neck, chest, belly and tail in one shape.
  bodyPath(ctx);
  ctx.fillStyle = linear(ctx, 0, 60, 0, 210, SCALE);
  ctx.fill();
  clipped(ctx, () => bodyPath(ctx), () => {
    // Belly plates follow the underside.
    ctx.lineCap = 'round';
    for (const [a, b, c, d, width] of UNDERSIDE) {
      ctx.beginPath();
      ctx.moveTo(...a);
      ctx.bezierCurveTo(b[0], b[1], c[0], c[1], d[0], d[1]);
      ctx.lineWidth = width;
      ctx.strokeStyle = BELLY;
      ctx.stroke();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = 'rgba(176,104,40,0.7)';
      for (const p of along(a, b, c, d, Math.max(2, Math.round(Math.hypot(d[0] - a[0], d[1] - a[1]) / 13)))) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.nx * width * 0.5, p.y + p.ny * width * 0.5);
        ctx.stroke();
      }
    }
    // Sheen along the back and a row of scale arcs.
    ctx.save();
    ctx.globalAlpha = 0.28;
    ellipse(ctx, 230, 104, 90, 10, -0.05);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(122,20,26,0.45)';
    for (const [x, y] of [[300, 112], [280, 124], [252, 120], [226, 126], [200, 124], [174, 130], [150, 136], [104, 136], [78, 128]]) {
      ctx.beginPath();
      ctx.arc(x, y, 8, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }
  });
  bodyPath(ctx);
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // Near legs.
  hindLeg(ctx, 0, 0, linear(ctx, 0, 140, 0, 220, SCALE));
  frontLeg(ctx, 0, 0, linear(ctx, 0, 140, 0, 210, SCALE));
  paintDragonHead(ctx);
}

function headPath(ctx: Ctx) {
  ctx.beginPath();
  ctx.moveTo(344, 64);
  ctx.bezierCurveTo(350, 48, 368, 40, 386, 42);
  ctx.bezierCurveTo(398, 43, 408, 50, 420, 54);
  ctx.bezierCurveTo(436, 58, 452, 62, 462, 66);
  ctx.bezierCurveTo(470, 69, 477, 76, 477, 84);
  ctx.bezierCurveTo(477, 90, 472, 93, 466, 94);
  ctx.lineTo(400, 99);
  ctx.bezierCurveTo(388, 100, 376, 108, 362, 108);
  ctx.bezierCurveTo(350, 108, 340, 96, 344, 64);
  ctx.closePath();
}

function paintDragonHead(ctx: Ctx) {
  // Horns sweep back from the crown; the far one darker.
  spike(ctx, [380, 46], [394, 46], [356, 6], 0.2);
  fillStroke(ctx, linear(ctx, 356, 6, 390, 46, [[0, '#E8D8B0'], [1, '#9A7A50']]), 2.4);
  spike(ctx, [360, 54], [378, 46], [318, 16], 0.22);
  fillStroke(ctx, linear(ctx, 318, 16, 370, 50, HORN), 2.6);
  // Cheek spikes behind the jaw.
  for (const [a, b, tip] of [[[352, 86], [350, 98], [324, 90]], [[350, 98], [354, 108], [330, 110]], [[354, 72], [350, 84], [330, 70]]] as [Point, Point, Point][]) {
    spike(ctx, a, b, tip, -0.12);
    fillStroke(ctx, linear(ctx, tip[0], 0, a[0], 0, [[0, '#FFB13D'], [1, '#D8342A']]), 2.2);
  }
  headPath(ctx);
  ctx.fillStyle = radial(ctx, 410, 62, 90, SCALE, 400, 50, 0);
  ctx.fill();
  clipped(ctx, () => headPath(ctx), () => {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ellipse(ctx, 420, 54, 44, 7, 0.12);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(122,20,26,0.38)';
    polygon(ctx, [[340, 92], [480, 84], [480, 110], [340, 112]]);
    ctx.fill();
    // Ridged snout.
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(122,20,26,0.5)';
    for (const x of [436, 448]) {
      ctx.beginPath();
      ctx.arc(x, 66, 6, 1.1 * Math.PI, 1.9 * Math.PI);
      ctx.stroke();
    }
  });
  headPath(ctx);
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // Upper teeth, with a long fang near the front.
  for (let x = 404; x < 458; x += 9) {
    const y = 99 - (x - 400) * 0.075;
    polygon(ctx, [[x, y - 1], [x + 4, y + 7], [x + 8, y - 1.5]]);
    fillStroke(ctx, '#FFFFFF', 1.4);
  }
  polygon(ctx, [[456, 94], [461, 108], [466, 93]]);
  fillStroke(ctx, '#FFFFFF', 1.6);
  // Glowing slit eye under a heavy brow.
  glow(ctx, 412, 66, 22, '#FFB13D', 0.6);
  ellipse(ctx, 412, 67, 11, 7, -0.18);
  fillStroke(ctx, radial(ctx, 412, 67, 11, [[0, '#FFFBE0'], [0.45, '#FFE07A'], [1, '#FF7A1F']]), 2);
  ellipse(ctx, 414, 67, 1.8, 6, 0.1);
  ctx.fillStyle = INK;
  ctx.fill();
  ellipse(ctx, 409, 64, 2.2, 1.6);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(394, 58);
  ctx.quadraticCurveTo(410, 50, 430, 62);
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#5A0E12';
  ctx.stroke();
  // Flared nostril.
  ellipse(ctx, 466, 73, 4.4, 2.6, -0.5);
  ctx.fillStyle = '#3A0A0E';
  ctx.fill();
}

function jawPath(ctx: Ctx) {
  ctx.beginPath();
  ctx.moveTo(6, 10);
  ctx.lineTo(112, 6);
  ctx.bezierCurveTo(121, 7, 123, 15, 116, 21);
  ctx.bezierCurveTo(94, 32, 50, 36, 16, 30);
  ctx.bezierCurveTo(7, 28, 2, 18, 6, 10);
  ctx.closePath();
}

function paintDragonJaw(ctx: Ctx) {
  // Lower teeth stand on the jaw's top edge, behind its outline.
  for (let x = 44; x < 100; x += 9) {
    const y = 10 - (x - 6) * 0.038;
    polygon(ctx, [[x, y + 1], [x + 4, y - 7], [x + 8, y + 1]]);
    fillStroke(ctx, '#FFFFFF', 1.4);
  }
  polygon(ctx, [[100, 7.5], [105, 0], [110, 7]]);
  fillStroke(ctx, '#FFFFFF', 1.6);
  jawPath(ctx);
  ctx.fillStyle = linear(ctx, 0, 6, 0, 36, [[0, '#E8483A'], [1, '#7A141A']]);
  ctx.fill();
  clipped(ctx, () => jawPath(ctx), () => {
    ellipse(ctx, 66, 11, 52, 5, -0.04);
    ctx.fillStyle = '#FF7A8A';
    ctx.fill();
    ctx.fillStyle = BELLY;
    polygon(ctx, [[10, 30], [118, 18], [118, 40], [10, 40]]);
    ctx.fill();
  });
  jawPath(ctx);
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

// Raised bat wing: a thick arm along the leading edge, four fingers and a scalloped membrane.
const WING = {
  shoulder: [262, 192] as Point,
  elbow: [242, 124] as Point,
  wrist: [192, 46] as Point,
  tips: [[104, 8], [32, 40], [8, 106], [56, 164]] as Point[],
  root: [204, 206] as Point,
};

function membranePath(ctx: Ctx) {
  const { shoulder, elbow, wrist, tips, root } = WING;
  const sag = (a: Point, b: Point, amount: number): Point => {
    const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    return [mid[0] + (wrist[0] - mid[0]) * amount, mid[1] + (wrist[1] - mid[1]) * amount];
  };
  ctx.beginPath();
  ctx.moveTo(...shoulder);
  ctx.lineTo(...elbow);
  ctx.lineTo(...wrist);
  ctx.lineTo(...tips[0]);
  for (let i = 1; i < tips.length; i++) ctx.quadraticCurveTo(...sag(tips[i - 1], tips[i], 0.3), ...tips[i]);
  ctx.quadraticCurveTo(...sag(tips[tips.length - 1], root, 0.22), ...root);
  ctx.quadraticCurveTo(236, 204, ...shoulder);
  ctx.closePath();
}

function paintDragonWing(ctx: Ctx) {
  const { shoulder, elbow, wrist, tips } = WING;
  membranePath(ctx);
  ctx.fillStyle = linear(ctx, wrist[0], wrist[1], 40, 170, [[0, '#C8344A'], [0.55, '#8E1C32'], [1, '#56102A']]);
  ctx.fill();
  clipped(ctx, () => membranePath(ctx), () => {
    // Lighter panels between the fingers, as if the light shows through.
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = radial(ctx, 150, 90, 120, [[0, '#FFB0A0'], [1, 'rgba(255,176,160,0)']]);
    ctx.fillRect(0, 0, 290, 210);
    ctx.restore();
  });
  membranePath(ctx);
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // Finger bones taper from the wrist, each ending in a small claw.
  for (const tip of tips) {
    const dx = tip[0] - wrist[0];
    const dy = tip[1] - wrist[1];
    const length = Math.hypot(dx, dy);
    const nx = -dy / length;
    const ny = dx / length;
    polygon(ctx, [[wrist[0] + nx * 3.5, wrist[1] + ny * 3.5], [tip[0] + nx, tip[1] + ny], [tip[0] - nx, tip[1] - ny], [wrist[0] - nx * 3.5, wrist[1] - ny * 3.5]]);
    fillStroke(ctx, '#5A0E1E', 1.4);
  }
  for (const tip of tips.slice(0, 3)) {
    spike(ctx, [tip[0] - 3, tip[1] + 2], [tip[0] + 3, tip[1] - 2], [tip[0] - 8, tip[1] - 6], 0.3);
    fillStroke(ctx, '#FFF4DC', 1.4);
  }
  // Arm: a thick scaly limb from the shoulder to the wrist, with a hooked thumb.
  spike(ctx, [wrist[0] - 3, wrist[1] - 4], [wrist[0] + 5, wrist[1] + 1], [wrist[0] + 12, wrist[1] - 16], -0.3);
  fillStroke(ctx, '#FFF4DC', 1.8);
  polygon(ctx, [[shoulder[0] - 11, shoulder[1]], [elbow[0] - 7, elbow[1]], [wrist[0] - 4, wrist[1] + 2], [wrist[0] + 4, wrist[1] - 3], [elbow[0] + 7, elbow[1] - 2], [shoulder[0] + 11, shoulder[1] - 4]]);
  fillStroke(ctx, linear(ctx, wrist[0], wrist[1], shoulder[0], shoulder[1], SCALE), 2.6);
  for (const [x, y, r] of [[elbow[0], elbow[1], 7], [wrist[0], wrist[1], 5]] as [number, number, number][]) {
    ellipse(ctx, x, y, r, r);
    fillStroke(ctx, radial(ctx, x - 2, y - 2, r, SCALE), 2);
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
