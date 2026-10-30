import Phaser from 'phaser';
import { artScale, bake, clipped, ellipse, fillStroke, glow, linear, makeCanvas, radial, roundRect, star, unbake } from './art';
import { eyesPart, PORTRAIT_BLINK_KEY, PORTRAIT_KEY, ROBOT_EXPRESSIONS, ROBOT_PARTS, ROBOT_RIG, type PartSpec, type RobotExpression } from './asset-manifest';
import { INK, INK_SOFT, PROP, ROBOT } from './palette';
import { DEFAULT_CHARACTER, type Character, type RobotLook, type RobotPaint } from '../characters';
import { getEquippedRobot } from '../progress';

// TEMPORARY ART: code-painted stand-ins for the robot parts specified in docs/ASSET_MANIFEST.md.
// They follow the reference design (white helmet, orange ear fins, black visor, cyan eyes, wheel legs)
// so the rig and animations can be built now; delivered PNGs replace them key by key.

// Shape choices of the robot being painted; set alongside the palette in withPalette.
let look: RobotLook = {};

const metal = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) =>
  radial(ctx, x, y, r, [[0, '#C9D1DC'], [0.55, ROBOT.metalLight], [1, ROBOT.metal]], x - r * 0.4, y - r * 0.4, 0);

const orangeFill = (ctx: CanvasRenderingContext2D, top: number, bottom: number) =>
  linear(ctx, 0, top, 0, bottom, [[0, ROBOT.orangeLight], [0.5, ROBOT.orange], [1, ROBOT.orangeDark]]);

const goldFill = (ctx: CanvasRenderingContext2D, top: number, bottom: number) =>
  linear(ctx, 0, top, 0, bottom, [[0, PROP.gold[0]], [0.5, PROP.gold[1]], [1, PROP.gold[2]]]);

const leafFill = (ctx: CanvasRenderingContext2D, top: number, bottom: number) =>
  linear(ctx, 0, top, 0, bottom, [[0, '#C8F07A'], [0.5, '#7ED957'], [1, '#3E9A3A']]);

const glowFill = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) =>
  radial(ctx, x, y, r, [[0, ROBOT.eyeCore], [0.55, ROBOT.eye], [1, ROBOT.eyeDeep]], x - r * 0.3, y - r * 0.3, 0);

function heartPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + size);
  ctx.bezierCurveTo(cx - size * 1.5, cy, cx - size * 0.9, cy - size * 1.25, cx, cy - size * 0.45);
  ctx.bezierCurveTo(cx + size * 0.9, cy - size * 1.25, cx + size * 1.5, cy, cx, cy + size);
  ctx.closePath();
}

function boltPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.beginPath();
  [[0.25, -1], [-0.55, 0.12], [-0.02, 0.12], [-0.3, 1], [0.6, -0.2], [0.05, -0.2], [0.35, -1]].forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(cx + x * size, cy + y * size); else ctx.lineTo(cx + x * size, cy + y * size);
  });
  ctx.closePath();
}

function diamondPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);
  ctx.lineTo(cx + size * 0.8, cy);
  ctx.lineTo(cx, cy + size);
  ctx.lineTo(cx - size * 0.8, cy);
  ctx.closePath();
}

function paintHead(ctx: CanvasRenderingContext2D) {
  const cx = 20, cy = 18, rx = 17, ry = 15;
  const box = look.head === 'box';
  const shell = box ? () => roundRect(ctx, 3.5, 4.5, 33, 28.5, 9) : () => ellipse(ctx, cx, cy, rx, ry);
  const inner = box ? () => roundRect(ctx, 5.7, 6.7, 28.6, 24.1, 7) : () => ellipse(ctx, cx, cy, rx - 2.2, ry - 2.2);
  shell();
  ctx.fillStyle = radial(ctx, cx, cy, 25, [[0, '#FFFFFF'], [0.5, ROBOT.white], [1, ROBOT.whiteShade]], cx - 8, cy - 9, 1);
  ctx.fill();
  clipped(ctx, shell, () => {
    // Orange side plate on the near side carries the ear fin.
    ellipse(ctx, 6.5, 19, 9.5, 14);
    ctx.fillStyle = orangeFill(ctx, 5, 33);
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = INK_SOFT;
    ctx.stroke();
    ctx.fillStyle = linear(ctx, 0, 23, 0, 34, [[0, 'rgba(91,76,122,0)'], [1, 'rgba(91,76,122,0.3)']]);
    ctx.fillRect(0, 22, 42, 14);
    // Racing trim just inside the rim; the visor covers its front half.
    if (look.stripe) {
      inner();
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = ROBOT.orange;
      ctx.stroke();
    }
  });
  ellipse(ctx, 7.5, 18.5, 3, 3);
  fillStroke(ctx, metal(ctx, 7.5, 18.5, 3), 1.1);
  ellipse(ctx, 7.5, 18.5, 1, 1);
  ctx.fillStyle = ROBOT.metalDark;
  ctx.fill();
  clipped(ctx, inner, () => {
    roundRect(ctx, 15, 8.5, 26, 19.5, 8.5);
    ctx.fillStyle = linear(ctx, 0, 8.5, 0, 28, [[0, ROBOT.visorTop], [1, ROBOT.visorBottom]]);
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = '#0B0F18';
    ctx.stroke();
    ctx.save();
    ctx.globalAlpha = 0.3;
    ellipse(ctx, 24, 12.2, 7.5, 2.4, -0.15);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.globalAlpha = 0.2;
    ellipse(ctx, 32.5, 25.2, 5, 1.3, -0.25);
    ctx.fillStyle = '#9FE9FF';
    ctx.fill();
    ctx.restore();
    // LED blush under the eyes.
    if (look.cheeks) {
      for (const x of [21.5, 31]) {
        ellipse(ctx, x, 25.2, 2.8, 1.4);
        ctx.fillStyle = 'rgba(255,128,170,0.8)';
        ctx.fill();
      }
    }
  });
  ctx.save();
  ctx.globalAlpha = 0.85;
  ellipse(ctx, box ? 12.5 : 13.5, box ? 8 : 7.5, 6.2, box ? 2.2 : 2.8, box ? -0.2 : -0.45);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.restore();
  shell();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function paintFin(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.moveTo(3, 18.5);
  ctx.quadraticCurveTo(2.4, 11, 6.6, 6.2);
  ctx.quadraticCurveTo(9, 4, 10.8, 6.6);
  ctx.quadraticCurveTo(14, 12, 13.4, 18.5);
  ctx.closePath();
  fillStroke(ctx, linear(ctx, 2, 0, 14, 0, [[0, ROBOT.orangeLight], [0.55, ROBOT.orange], [1, ROBOT.orangeDark]]), 2);
  ctx.beginPath();
  ctx.moveTo(6, 16.5);
  ctx.quadraticCurveTo(5.8, 11.5, 8, 8.5);
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = 'rgba(255,248,236,0.7)';
  ctx.stroke();
}

// The ear slot (drawn near and far): the original fin or another shape in the same 16×20 box.
function paintEar(ctx: CanvasRenderingContext2D) {
  const kind = look.ears ?? 'fin';
  if (kind === 'fin') {
    paintFin(ctx);
  } else if (kind === 'antenna') {
    roundRect(ctx, 6.9, 7, 2.2, 12, 1.1);
    fillStroke(ctx, linear(ctx, 6.9, 0, 9.1, 0, [[0, ROBOT.metalLight], [1, ROBOT.metal]]), 1);
    glow(ctx, 8, 5, 6.5, ROBOT.eye, 0.45);
    ellipse(ctx, 8, 5, 3.4, 3.4);
    fillStroke(ctx, glowFill(ctx, 8, 5, 3.6), 1.4);
  } else if (kind === 'horn') {
    ctx.beginPath();
    ctx.moveTo(3, 18.5);
    ctx.quadraticCurveTo(3.5, 8, 10.5, 1.5);
    ctx.quadraticCurveTo(9.5, 10, 13, 18.5);
    ctx.closePath();
    fillStroke(ctx, orangeFill(ctx, 2, 18), 1.8);
    ctx.beginPath();
    ctx.moveTo(5.6, 16);
    ctx.quadraticCurveTo(6, 9.5, 9, 5);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,248,236,0.6)';
    ctx.stroke();
  } else if (kind === 'cat') {
    ctx.beginPath();
    ctx.moveTo(1.5, 18.5);
    ctx.quadraticCurveTo(3, 9, 6.6, 3);
    ctx.quadraticCurveTo(8, 1.4, 9.4, 3);
    ctx.quadraticCurveTo(13.5, 9.5, 14.5, 18.5);
    ctx.closePath();
    fillStroke(ctx, orangeFill(ctx, 2, 19), 1.9);
    ctx.beginPath();
    ctx.moveTo(4.6, 17.5);
    ctx.quadraticCurveTo(5.6, 11, 8, 6.5);
    ctx.quadraticCurveTo(10.6, 11, 11.6, 17.5);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,196,214,0.95)';
    ctx.fill();
  } else if (kind === 'bunny') {
    ellipse(ctx, 8, 10, 4.8, 9);
    fillStroke(ctx, linear(ctx, 3, 0, 13, 0, [[0, '#FFFFFF'], [0.6, ROBOT.white], [1, ROBOT.whiteShade]]), 1.9);
    ellipse(ctx, 8.3, 10.8, 2.3, 6.4);
    ctx.fillStyle = orangeFill(ctx, 4, 17);
    ctx.fill();
  } else if (kind === 'bear') {
    ellipse(ctx, 8, 12.5, 6, 6);
    fillStroke(ctx, orangeFill(ctx, 6.5, 18.5), 1.9);
    ellipse(ctx, 8, 13, 3, 3);
    ctx.fillStyle = 'rgba(255,226,204,0.85)';
    ctx.fill();
  } else if (kind === 'wing') {
    for (const [x, y, rx, ry, angle] of [[4.6, 12.5, 2.3, 5.4, -0.4], [6.8, 10, 2.5, 6.8, -0.12], [9.4, 8.2, 2.6, 7.6, 0.18]]) {
      ellipse(ctx, x, y, rx, ry, angle);
      fillStroke(ctx, linear(ctx, 0, 1, 0, 18, [[0, '#FFFFFF'], [1, ROBOT.whiteShade]]), 1.3);
    }
    ellipse(ctx, 7.5, 17, 4, 2.2);
    fillStroke(ctx, orangeFill(ctx, 15, 19), 1.3);
  } else if (kind === 'bolt') {
    boltPath(ctx, 8, 10, 8.5);
    fillStroke(ctx, goldFill(ctx, 1.5, 18.5), 1.7);
  } else {
    ctx.beginPath();
    ctx.moveTo(8, 18.5);
    ctx.bezierCurveTo(1.5, 13, 2.5, 4.5, 9.5, 1.5);
    ctx.bezierCurveTo(14.5, 6.5, 14, 14, 8, 18.5);
    ctx.closePath();
    fillStroke(ctx, leafFill(ctx, 1.5, 18.5), 1.7);
    ctx.beginPath();
    ctx.moveTo(8, 17);
    ctx.quadraticCurveTo(8, 9, 9.5, 3.5);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(30,80,30,0.5)';
    ctx.stroke();
  }
}

// Headgear on the helmet top, base along y ≈ 19 of a 32×22 box; the face looks right.
function paintCrest(ctx: CanvasRenderingContext2D) {
  const kind = look.crest;
  if (kind === 'crown') {
    ctx.beginPath();
    ctx.moveTo(7, 19.5);
    ctx.lineTo(6, 7);
    ctx.lineTo(11, 12);
    ctx.lineTo(16, 4);
    ctx.lineTo(21, 12);
    ctx.lineTo(26, 7);
    ctx.lineTo(25, 19.5);
    ctx.quadraticCurveTo(16, 17.5, 7, 19.5);
    ctx.closePath();
    fillStroke(ctx, goldFill(ctx, 4, 20), 1.7);
    for (const [x, y] of [[6, 7], [16, 4], [26, 7]]) {
      ellipse(ctx, x, y, 1.9, 1.9);
      fillStroke(ctx, PROP.gold[0], 1.1);
    }
    ellipse(ctx, 16, 15, 2.4, 2.4);
    fillStroke(ctx, glowFill(ctx, 16, 15, 2.6), 1.1);
  } else if (kind === 'tiara') {
    ctx.beginPath();
    ctx.moveTo(8, 19.5);
    ctx.lineTo(10.5, 14);
    ctx.lineTo(13, 16);
    ctx.lineTo(16, 8.5);
    ctx.lineTo(19, 16);
    ctx.lineTo(21.5, 14);
    ctx.lineTo(24, 19.5);
    ctx.quadraticCurveTo(16, 17, 8, 19.5);
    ctx.closePath();
    fillStroke(ctx, linear(ctx, 0, 8, 0, 20, [[0, '#FFFFFF'], [0.5, '#DDE6F5'], [1, '#9CA9C2']]), 1.5);
    diamondPath(ctx, 16, 13, 2.8);
    fillStroke(ctx, glowFill(ctx, 16, 13, 2.8), 1);
    for (const x of [10.5, 21.5]) {
      ellipse(ctx, x, 14.5, 1.1, 1.1);
      ctx.fillStyle = ROBOT.eye;
      ctx.fill();
    }
  } else if (kind === 'bow') {
    for (const [x, angle] of [[8.5, -0.4], [19.5, 0.4]]) {
      ellipse(ctx, x, 13, 6.2, 4.2, angle);
      fillStroke(ctx, orangeFill(ctx, 8, 18), 1.6);
      ellipse(ctx, x + (x < 14 ? 1 : -1), 13, 2.8, 1.4, angle);
      ctx.fillStyle = 'rgba(43,34,54,0.25)';
      ctx.fill();
    }
    ellipse(ctx, 14, 14, 2.8, 3.2);
    fillStroke(ctx, linear(ctx, 0, 11, 0, 17, [[0, ROBOT.orangeLight], [1, ROBOT.orange]]), 1.5);
  } else if (kind === 'flower') {
    roundRect(ctx, 15.2, 13, 1.6, 7, 0.8);
    fillStroke(ctx, '#5DBB4A', 1);
    for (let i = 0; i < 5; i++) {
      const angle = -Math.PI / 2 + i * Math.PI * 2 / 5;
      ellipse(ctx, 16 + Math.cos(angle) * 4.4, 10 + Math.sin(angle) * 4.4, 3.4, 3.4);
      fillStroke(ctx, radial(ctx, 16, 10, 8, [[0, '#FFFFFF'], [1, ROBOT.orangeLight]]), 1.2);
    }
    ellipse(ctx, 16, 10, 2.6, 2.6);
    fillStroke(ctx, goldFill(ctx, 7.5, 12.5), 1.1);
  } else if (kind === 'halo') {
    glow(ctx, 16, 7, 13, '#FFE680', 0.35);
    ellipse(ctx, 16, 7, 10, 3);
    ctx.lineWidth = 3.8;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#FFD24A';
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(16, 7, 10, 3, 0, Math.PI * 1.1, Math.PI * 1.5);
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#FFF6C2';
    ctx.stroke();
  } else if (kind === 'mohawk') {
    ctx.beginPath();
    ctx.moveTo(7.5, 19.5);
    ctx.lineTo(2.5, 9.5);
    ctx.lineTo(10, 13.5);
    ctx.lineTo(8, 4);
    ctx.lineTo(15, 11.5);
    ctx.lineTo(15.5, 2);
    ctx.lineTo(20.5, 11);
    ctx.lineTo(23.5, 5.5);
    ctx.lineTo(25, 19.5);
    ctx.quadraticCurveTo(16, 17.5, 7.5, 19.5);
    ctx.closePath();
    fillStroke(ctx, orangeFill(ctx, 2, 20), 1.7);
  } else if (kind === 'flame') {
    glow(ctx, 16, 11, 14, '#FF8A1F', 0.35);
    ctx.beginPath();
    ctx.moveTo(8, 19.5);
    ctx.quadraticCurveTo(3, 13, 5.5, 7);
    ctx.quadraticCurveTo(8, 10.5, 10, 10);
    ctx.quadraticCurveTo(9, 4, 14, 0.8);
    ctx.quadraticCurveTo(14.5, 7, 17.5, 8);
    ctx.quadraticCurveTo(19, 4, 22, 3.5);
    ctx.quadraticCurveTo(21, 8, 24, 11.5);
    ctx.quadraticCurveTo(27.5, 15, 25, 19.5);
    ctx.quadraticCurveTo(16, 17.5, 8, 19.5);
    ctx.closePath();
    fillStroke(ctx, linear(ctx, 0, 1, 0, 20, [[0, '#FFF3A0'], [0.45, '#FFB13D'], [1, '#FF5A2A']]), 1.6);
    ctx.beginPath();
    ctx.moveTo(11.5, 19);
    ctx.quadraticCurveTo(9, 14, 12, 10.5);
    ctx.quadraticCurveTo(13.5, 13, 15, 12.5);
    ctx.quadraticCurveTo(15, 8.5, 18, 7);
    ctx.quadraticCurveTo(17.5, 11, 20.5, 13.5);
    ctx.quadraticCurveTo(22, 16.5, 20.5, 19);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,246,194,0.9)';
    ctx.fill();
  } else if (kind === 'vfin') {
    // Twin blades rising from a forehead gem, front blade short and the back one long.
    for (const blade of [[[22.5, 19], [7.5, 4], [10.5, 3], [26, 16.5]], [[23, 17], [29.5, 2], [31.5, 3.8], [27.5, 19.5]]]) {
      ctx.beginPath();
      blade.forEach(([x, y], index) => { if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.closePath();
      fillStroke(ctx, goldFill(ctx, 2.5, 19.5), 1.4);
    }
    ellipse(ctx, 25, 18.5, 3, 2.6);
    fillStroke(ctx, radial(ctx, 24, 17.5, 3.4, [[0, '#FF9A9A'], [1, '#C8202A']]), 1.2);
  } else if (kind === 'horn') {
    ctx.beginPath();
    ctx.moveTo(21.2, 19.5);
    ctx.quadraticCurveTo(24, 10, 27.6, 0.8);
    ctx.quadraticCurveTo(27.6, 10, 27.4, 19.5);
    ctx.closePath();
    fillStroke(ctx, linear(ctx, 0, 1, 0, 20, [[0, '#FFFFFF'], [0.5, '#FFE680'], [1, '#FFB0E0']]), 1.5);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(200,120,180,0.6)';
    for (const t of [0.3, 0.55, 0.78]) {
      const y = 19.5 - t * 18.7;
      ctx.beginPath();
      ctx.moveTo(21.5 + 6 * t, y + 0.8);
      ctx.lineTo(27.4, y - 0.8);
      ctx.stroke();
    }
  } else if (kind === 'propeller') {
    ctx.beginPath();
    ctx.moveTo(8, 19.5);
    ctx.quadraticCurveTo(16, 9.5, 24, 19.5);
    ctx.quadraticCurveTo(16, 17.5, 8, 19.5);
    ctx.closePath();
    fillStroke(ctx, orangeFill(ctx, 13, 20), 1.6);
    roundRect(ctx, 15, 7.5, 2, 7, 1);
    fillStroke(ctx, ROBOT.metal, 1);
    ellipse(ctx, 9.5, 7, 6.5, 1.9, -0.08);
    fillStroke(ctx, '#FFD23F', 1.3);
    ellipse(ctx, 22.5, 7, 6.5, 1.9, 0.08);
    fillStroke(ctx, '#4FA8FF', 1.3);
    ellipse(ctx, 16, 7, 2, 2);
    fillStroke(ctx, goldFill(ctx, 5, 9), 1.1);
  } else if (kind === 'sprout') {
    ctx.beginPath();
    ctx.moveTo(16, 19.5);
    ctx.quadraticCurveTo(15, 14, 16.5, 9.5);
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#5DBB4A';
    ctx.stroke();
    ellipse(ctx, 11.5, 9, 5, 2.6, -0.5);
    fillStroke(ctx, leafFill(ctx, 6, 12), 1.5);
    ellipse(ctx, 21, 8, 5, 2.6, 0.45);
    fillStroke(ctx, leafFill(ctx, 5, 11), 1.5);
  }
}

const EYE_POSITIONS = [{ x: 8.5, y: 8, w: 7, h: 11 }, { x: 18.5, y: 8, w: 6, h: 10.5 }];
const MONO_EYE = [{ x: 13.5, y: 8, w: 10.5, h: 10.5 }];

function paintEyes(ctx: CanvasRenderingContext2D, expression: RobotExpression) {
  const style = look.eyes ?? 'pill';
  const eyeFill = (top: number, bottom: number) => linear(ctx, 0, top, 0, bottom, [[0, ROBOT.eyeCore], [0.45, ROBOT.eye], [1, ROBOT.eyeDeep]]);
  // Visor: one glowing bar across both eyes; the other expressions keep the usual pair.
  if (style === 'visor' && (expression === 'normal' || expression === 'surprised' || expression === 'blink')) {
    const height = expression === 'blink' ? 2 : expression === 'surprised' ? 9 : 6.2;
    glow(ctx, 12, 8, 11, ROBOT.eye, expression === 'blink' ? 0.2 : 0.4);
    roundRect(ctx, 3, 8 - height / 2, 18, height, height / 2);
    ctx.fillStyle = eyeFill(8 - height / 2, 8 + height / 2);
    ctx.fill();
    if (expression !== 'blink') {
      roundRect(ctx, 5, 8 - height / 2 + 1.1, 7, 1.3, 0.65);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fill();
    }
    return;
  }
  const mono = style === 'mono';
  for (const [index, eye] of (mono ? MONO_EYE : EYE_POSITIONS).entries()) {
    const mirror = index === 0 ? 1 : -1;
    if (expression !== 'dead') glow(ctx, eye.x, eye.y, (expression === 'surprised' ? 9 : 7.5) * (mono ? 1.4 : 1), ROBOT.eye, expression === 'blink' ? 0.25 : 0.4);
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = ROBOT.eye;
    if (expression === 'normal') {
      if (style === 'round') ellipse(ctx, eye.x, eye.y + 0.5, eye.w * 0.64, eye.w * 0.64);
      else if (mono) ellipse(ctx, eye.x, eye.y, 5.2, 5.2);
      else if (style === 'heart') heartPath(ctx, eye.x, eye.y + 0.6, eye.w * 0.56);
      else if (style === 'star') star(ctx, eye.x, eye.y + 0.4, eye.w * 0.74, eye.w * 0.32);
      else roundRect(ctx, eye.x - eye.w / 2, eye.y - eye.h / 2, eye.w, eye.h, eye.w / 2);
      ctx.fillStyle = eyeFill(eye.y - eye.h / 2, eye.y + eye.h / 2);
      if (style === 'sharp') {
        // Brows slant down toward the middle of the face.
        const top = eye.y - eye.h / 2;
        clipped(ctx, () => {
          ctx.beginPath();
          ctx.moveTo(eye.x - 5 * mirror, top - 1);
          ctx.lineTo(eye.x + 5 * mirror, top + 4.2);
          ctx.lineTo(eye.x + 5 * mirror, eye.y + 8);
          ctx.lineTo(eye.x - 5 * mirror, eye.y + 8);
          ctx.closePath();
        }, () => {
          roundRect(ctx, eye.x - eye.w / 2, eye.y - eye.h / 2, eye.w, eye.h, eye.w / 2);
          ctx.fill();
        });
      } else ctx.fill();
      if (mono) {
        ellipse(ctx, eye.x + 1, eye.y + 0.3, 2.1, 2.1);
        ctx.fillStyle = ROBOT.visorBottom;
        ctx.fill();
      }
    } else if (expression === 'blink') {
      const half = mono ? 5 : 3.8;
      roundRect(ctx, eye.x - half, eye.y + 0.5, half * 2, 1.9, 0.95);
      ctx.fillStyle = ROBOT.eye;
      ctx.fill();
    } else if (expression === 'happy') {
      ctx.beginPath();
      ctx.arc(eye.x, eye.y + 3, mono ? 5 : 3.7, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
    } else if (expression === 'surprised') {
      ellipse(ctx, eye.x, eye.y, eye.w * 0.66, eye.w * 0.66);
      ctx.fillStyle = eyeFill(eye.y - 5, eye.y + 5);
      ctx.fill();
    } else if (expression === 'hurt') {
      ctx.beginPath();
      ctx.moveTo(eye.x - 2.8 * mirror, eye.y - 3.4);
      ctx.lineTo(eye.x + 2.4 * mirror, eye.y);
      ctx.lineTo(eye.x - 2.8 * mirror, eye.y + 3.4);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#8FA3B8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(eye.x - 2.8, eye.y - 2.8);
      ctx.lineTo(eye.x + 2.8, eye.y + 2.8);
      ctx.moveTo(eye.x + 2.8, eye.y - 2.8);
      ctx.lineTo(eye.x - 2.8, eye.y + 2.8);
      ctx.stroke();
    }
    if (expression === 'normal' || expression === 'surprised') {
      const lower = style === 'sharp' && expression === 'normal' ? eye.h * 0.22 : 0;
      ellipse(ctx, eye.x - eye.w * 0.18, eye.y - eye.h * 0.24 + lower, 1.25, 1.25);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      if (style === 'round' && expression === 'normal') {
        ellipse(ctx, eye.x + eye.w * 0.2, eye.y + eye.h * 0.22, 0.75, 0.75);
        ctx.fill();
      }
    }
  }
}

function paintTorso(ctx: CanvasRenderingContext2D) {
  const body = () => roundRect(ctx, 2, 2, 18, 15, 6.5);
  body();
  ctx.fillStyle = linear(ctx, 2, 2, 20, 17, [[0, '#FFFFFF'], [0.55, ROBOT.white], [1, ROBOT.whiteShade]]);
  ctx.fill();
  clipped(ctx, body, () => {
    ctx.fillStyle = orangeFill(ctx, 11, 18);
    ctx.fillRect(0, 11.5, 22, 8);
    ctx.fillStyle = INK_SOFT;
    ctx.fillRect(0, 11, 22, 1);
  });
  const chest = look.chest ?? 'core';
  glow(ctx, 11, 7.5, chest === 'core' ? 6 : 7, ROBOT.eye, 0.35);
  if (chest === 'star') star(ctx, 11, 7.7, 3.9, 1.7);
  else if (chest === 'heart') heartPath(ctx, 11, 7.6, 3);
  else if (chest === 'bolt') boltPath(ctx, 11, 7.5, 3.8);
  else if (chest === 'diamond') diamondPath(ctx, 11, 7.5, 3.4);
  else ellipse(ctx, 11, 7.5, 2.6, 2.6);
  fillStroke(ctx, radial(ctx, 11, 7.5, chest === 'core' ? 2.6 : 3.8, [[0, ROBOT.eyeCore], [1, ROBOT.eyeDeep]]), 1);
  roundRect(ctx, 7, 0.6, 8, 3, 1.5);
  fillStroke(ctx, metal(ctx, 11, 2, 4), 1);
  body();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function paintArm(ctx: CanvasRenderingContext2D) {
  roundRect(ctx, 4.2, 3.4, 3.6, 6.8, 1.8);
  fillStroke(ctx, linear(ctx, 4, 0, 8, 0, [[0, '#FFFFFF'], [1, ROBOT.whiteShade]]), 1.1);
  ellipse(ctx, 6, 3, 2.6, 2.6);
  fillStroke(ctx, metal(ctx, 6, 3, 2.6), 1.1);
  ellipse(ctx, 6, 11.4, 3.9, 3.9);
  fillStroke(ctx, radial(ctx, 6, 11.4, 4.2, [[0, ROBOT.orangeLight], [0.6, ROBOT.orange], [1, ROBOT.orangeDark]], 4.6, 10, 0), 1.8);
  ellipse(ctx, 4.8, 10.2, 1.1, 0.8, -0.5);
  ctx.fillStyle = 'rgba(255,248,236,0.8)';
  ctx.fill();
}

function paintLeg(ctx: CanvasRenderingContext2D) {
  roundRect(ctx, 2.4, 0.5, 3.2, 9, 1.5);
  fillStroke(ctx, linear(ctx, 2.4, 0, 5.6, 0, [[0, ROBOT.metalLight], [1, ROBOT.metal]]), 1.1);
}

function paintWheel(ctx: CanvasRenderingContext2D) {
  ellipse(ctx, 9, 9, 7.6, 7.6);
  fillStroke(ctx, ROBOT.metalDark, 1.8);
  ctx.strokeStyle = ROBOT.metal;
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 10; i++) {
    const angle = i * Math.PI / 5;
    ctx.beginPath();
    ctx.moveTo(9 + Math.cos(angle) * 6.1, 9 + Math.sin(angle) * 6.1);
    ctx.lineTo(9 + Math.cos(angle) * 7.2, 9 + Math.sin(angle) * 7.2);
    ctx.stroke();
  }
  ellipse(ctx, 9, 9, 4.8, 4.8);
  fillStroke(ctx, metal(ctx, 9, 9, 4.8), 1, INK_SOFT);
  ctx.strokeStyle = ROBOT.metal;
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    const angle = i * Math.PI * 2 / 3;
    ctx.beginPath();
    ctx.moveTo(9, 9);
    ctx.lineTo(9 + Math.cos(angle) * 4.4, 9 + Math.sin(angle) * 4.4);
    ctx.stroke();
  }
  ellipse(ctx, 9, 9, 2.2, 2.2);
  fillStroke(ctx, radial(ctx, 9, 9, 2.4, [[0, ROBOT.orangeLight], [1, ROBOT.orangeDark]]), 0.9);
  ctx.beginPath();
  ctx.arc(9, 9, 6.5, Math.PI * 1.1, Math.PI * 1.55);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function paintBall(ctx: CanvasRenderingContext2D) {
  const { ballRadius: r } = ROBOT_RIG;
  const sphere = () => ellipse(ctx, 22, 22, r, r);
  sphere();
  ctx.fillStyle = radial(ctx, 22, 22, r * 1.1, [[0, ROBOT.orangeLight], [0.55, ROBOT.orange], [1, ROBOT.orangeDark]], 14, 13, 1);
  ctx.fill();
  clipped(ctx, sphere, () => {
    ellipse(ctx, 8.5, 22, 13, 25);
    ctx.fillStyle = linear(ctx, 0, 0, 22, 44, [[0, '#FFFFFF'], [0.6, ROBOT.white], [1, ROBOT.whiteShade]]);
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = 'rgba(92,242,255,0.85)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(41, 22, 17, Math.PI * 0.72, Math.PI * 1.28);
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = 'rgba(92,242,255,0.7)';
    ctx.stroke();
    roundRect(ctx, 25, 15, 11.5, 14, 5.5);
    ctx.fillStyle = linear(ctx, 0, 15, 0, 29, [[0, ROBOT.visorTop], [1, ROBOT.visorBottom]]);
    ctx.fill();
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = '#0B0F18';
    ctx.stroke();
    glow(ctx, 30.8, 22, 6, ROBOT.eye, 0.45);
    roundRect(ctx, 28.8, 17.5, 4, 9, 2);
    ctx.fillStyle = linear(ctx, 0, 17.5, 0, 26.5, [[0, ROBOT.eyeCore], [0.5, ROBOT.eye], [1, ROBOT.eyeDeep]]);
    ctx.fill();
    for (const y of [12, 32]) {
      ellipse(ctx, 12, y, 1.3, 1.3);
      ctx.fillStyle = ROBOT.metalLight;
      ctx.fill();
    }
  });
}

// Non-rotating overlay: shading, specular and outline stay put while the shell spins under it.
function paintBallShade(ctx: CanvasRenderingContext2D) {
  const { ballRadius: r } = ROBOT_RIG;
  ellipse(ctx, 22, 22, r, r);
  ctx.fillStyle = radial(ctx, 15, 13, 32, [[0, 'rgba(255,255,255,0)'], [0.62, 'rgba(43,34,54,0)'], [1, 'rgba(43,34,54,0.45)']]);
  ctx.fill();
  ctx.save();
  ctx.globalAlpha = 0.75;
  ellipse(ctx, 14, 12, 6, 3.1, -0.6);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.globalAlpha = 0.5;
  ellipse(ctx, 10.5, 18, 1.6, 1.2);
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(22, 22, r - 1.3, Math.PI * 0.6, Math.PI * 0.95);
  ctx.strokeStyle = 'rgba(255,248,236,0.4)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ellipse(ctx, 22, 22, r, r);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function paintShadow(ctx: CanvasRenderingContext2D) {
  ellipse(ctx, 18, 5, 15, 3.6);
  ctx.fillStyle = radial(ctx, 18, 5, 15, [[0, 'rgba(43,34,54,0.38)'], [1, 'rgba(43,34,54,0)']]);
  ctx.fill();
}

const PAINTERS: [PartSpec, (ctx: CanvasRenderingContext2D) => void][] = [
  [ROBOT_PARTS.head, paintHead],
  [ROBOT_PARTS.fin, paintEar],
  [ROBOT_PARTS.crest, paintCrest],
  [ROBOT_PARTS.torso, paintTorso],
  [ROBOT_PARTS.arm, paintArm],
  [ROBOT_PARTS.leg, paintLeg],
  [ROBOT_PARTS.wheel, paintWheel],
  [ROBOT_PARTS.ball, paintBall],
  [ROBOT_PARTS.ballShade, paintBallShade],
  [ROBOT_PARTS.shadow, paintShadow],
  ...ROBOT_EXPRESSIONS.map((expression): [PartSpec, (ctx: CanvasRenderingContext2D) => void] => [eyesPart(expression), (ctx) => paintEyes(ctx, expression)]),
];

// Each robot is the same rig in its own colours and shapes: the painters read ROBOT and look, which are swapped while they run.
const DEFAULT_PALETTE = { ...ROBOT };
const mix = (from: string, to: string, amount: number) => {
  const channel = (hex: string, index: number) => parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
  return '#' + [0, 1, 2].map((index) => Math.round(channel(from, index) + (channel(to, index) - channel(from, index)) * amount).toString(16).padStart(2, '0')).join('');
};
function paletteFor(paint: RobotPaint): typeof ROBOT {
  if (paint === DEFAULT_CHARACTER.paint) return DEFAULT_PALETTE;
  return {
    orange: paint.accent, orangeLight: mix(paint.accent, '#FFFFFF', 0.32), orangeDark: mix(paint.accent, '#000000', 0.22),
    white: paint.body, whiteShade: mix(paint.body, '#6E6688', 0.2),
    metal: paint.metal, metalLight: mix(paint.metal, '#FFFFFF', 0.35), metalDark: mix(paint.metal, '#000000', 0.4),
    visorTop: paint.visor, visorBottom: mix(paint.visor, '#000000', 0.5),
    eye: paint.eye, eyeCore: mix(paint.eye, '#FFFFFF', 0.8), eyeDeep: mix(paint.eye, '#000000', 0.25),
  };
}
function withPalette(character: Character, paint: () => void) {
  Object.assign(ROBOT, paletteFor(character.paint));
  look = character.look;
  try { paint(); } finally { Object.assign(ROBOT, DEFAULT_PALETTE); look = {}; }
}

const ROBOT_KEYS = [...PAINTERS.map(([spec]) => spec.key), PORTRAIT_KEY, PORTRAIT_BLINK_KEY];
let bakedFor = '';

// Part textures are shared keys, so equipping another robot repaints them.
export function createRobotArt(scene: Phaser.Scene, character = getEquippedRobot()) {
  if (bakedFor !== character.id) ROBOT_KEYS.forEach((key) => unbake(scene, key));
  bakedFor = character.id;
  withPalette(character, () => {
    for (const [spec, paint] of PAINTERS) bake(scene, spec.key, spec.width, spec.height, paint);
  });
  bakePortrait(scene);
}

// Room above the helmet for headgear.
const PORTRAIT_WIDTH = 64;
const PORTRAIT_HEIGHT = 78;

// Idle pose composed from whatever part textures are active (painted or delivered PNG). Used by menus and UI.
function bakePortrait(scene: Phaser.Scene) {
  const source = (spec: PartSpec) => [scene.textures.get(spec.key).getSourceImage() as CanvasImageSource, artScale(spec.key)] as const;
  bake(scene, PORTRAIT_KEY, PORTRAIT_WIDTH, PORTRAIT_HEIGHT, (ctx) => paintPortrait(source, ctx, 'normal'));
  bake(scene, PORTRAIT_BLINK_KEY, PORTRAIT_WIDTH, PORTRAIT_HEIGHT, (ctx) => paintPortrait(source, ctx, 'blink'));
}

const portraits = new Map<string, string>();
// Portrait of any robot as an image URL (menus and the unlock card), painted off-screen once.
export function robotPortraitUrl(character: Character) {
  const cached = portraits.get(character.id);
  if (cached) return cached;
  const scale = 2;
  const parts = new Map<string, HTMLCanvasElement>();
  withPalette(character, () => {
    for (const [spec, paint] of PAINTERS) {
      const { canvas, ctx } = makeCanvas(spec.width, spec.height, scale);
      paint(ctx);
      parts.set(spec.key, canvas);
    }
  });
  const { canvas, ctx } = makeCanvas(PORTRAIT_WIDTH, PORTRAIT_HEIGHT, scale);
  paintPortrait((spec) => [parts.get(spec.key)!, scale], ctx, 'normal');
  const url = canvas.toDataURL();
  portraits.set(character.id, url);
  return url;
}

function paintPortrait(source: (spec: PartSpec) => readonly [CanvasImageSource, number], ctx: CanvasRenderingContext2D, expression: RobotExpression) {
  const feet = { x: 31, y: PORTRAIT_HEIGHT - 4 };
  const draw = (spec: PartSpec, x: number, y: number, angle = 0, partScale = 1, alpha = 1) => {
    const [image, pixels] = source(spec);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(angle * Math.PI / 180);
    ctx.scale(partScale / pixels, partScale / pixels);
    ctx.drawImage(image, -spec.pivotX * pixels, -spec.pivotY * pixels);
    ctx.restore();
  };
  const rig = ROBOT_RIG;
  const at = (point: { x: number; y: number }) => [feet.x + point.x, feet.y + point.y] as const;
  const neck = at(rig.neck);
  ellipse(ctx, feet.x, feet.y + 0.5, 15, 3.4);
  ctx.fillStyle = 'rgba(43,34,54,0.25)';
  ctx.fill();
  draw(ROBOT_PARTS.leg, ...at(rig.hipBack));
  draw(ROBOT_PARTS.wheel, ...at(rig.wheelBack), 0, 0.92, 0.85);
  draw(ROBOT_PARTS.arm, ...at(rig.shoulderBack), -10, 1, 0.85);
  draw(ROBOT_PARTS.torso, ...at(rig.torso));
  draw(ROBOT_PARTS.leg, ...at(rig.hipFront));
  draw(ROBOT_PARTS.wheel, ...at(rig.wheelFront));
  draw(ROBOT_PARTS.fin, neck[0] + rig.finFar.x, neck[1] + rig.finFar.y, rig.finFar.angle, rig.finFar.scale, 0.8);
  draw(ROBOT_PARTS.head, ...neck);
  draw(ROBOT_PARTS.crest, neck[0] + rig.crest.x, neck[1] + rig.crest.y);
  draw(eyesPart(expression), neck[0] + rig.eyes.x, neck[1] + rig.eyes.y);
  draw(ROBOT_PARTS.fin, neck[0] + rig.finNear.x, neck[1] + rig.finNear.y, rig.finNear.angle);
  draw(ROBOT_PARTS.arm, ...at(rig.shoulderFront), 12);
}
