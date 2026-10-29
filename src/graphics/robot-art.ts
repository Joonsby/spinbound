import Phaser from 'phaser';
import { artScale, bake, clipped, ellipse, fillStroke, glow, linear, makeCanvas, radial, roundRect, unbake } from './art';
import { eyesPart, PORTRAIT_BLINK_KEY, PORTRAIT_KEY, ROBOT_EXPRESSIONS, ROBOT_PARTS, ROBOT_RIG, type PartSpec, type RobotExpression } from './asset-manifest';
import { INK, INK_SOFT, ROBOT } from './palette';
import { DEFAULT_CHARACTER, type Character, type RobotPaint } from '../characters';
import { getEquippedRobot } from '../progress';

// TEMPORARY ART: code-painted stand-ins for the robot parts specified in docs/ASSET_MANIFEST.md.
// They follow the reference design (white helmet, orange ear fins, black visor, cyan eyes, wheel legs)
// so the rig and animations can be built now; delivered PNGs replace them key by key.

const metal = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) =>
  radial(ctx, x, y, r, [[0, '#C9D1DC'], [0.55, ROBOT.metalLight], [1, ROBOT.metal]], x - r * 0.4, y - r * 0.4, 0);

const orangeFill = (ctx: CanvasRenderingContext2D, top: number, bottom: number) =>
  linear(ctx, 0, top, 0, bottom, [[0, ROBOT.orangeLight], [0.5, ROBOT.orange], [1, ROBOT.orangeDark]]);

function paintHead(ctx: CanvasRenderingContext2D) {
  const cx = 20, cy = 18, rx = 17, ry = 15;
  const shell = () => ellipse(ctx, cx, cy, rx, ry);
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
  });
  ellipse(ctx, 7.5, 18.5, 3, 3);
  fillStroke(ctx, metal(ctx, 7.5, 18.5, 3), 1.1);
  ellipse(ctx, 7.5, 18.5, 1, 1);
  ctx.fillStyle = ROBOT.metalDark;
  ctx.fill();
  clipped(ctx, () => ellipse(ctx, cx, cy, rx - 2.2, ry - 2.2), () => {
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
  });
  ctx.save();
  ctx.globalAlpha = 0.85;
  ellipse(ctx, 13.5, 7.5, 6.2, 2.8, -0.45);
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

const EYE_POSITIONS = [{ x: 8.5, y: 8, w: 7, h: 11 }, { x: 18.5, y: 8, w: 6, h: 10.5 }];

function paintEyes(ctx: CanvasRenderingContext2D, expression: RobotExpression) {
  const eyeFill = (top: number, bottom: number) => linear(ctx, 0, top, 0, bottom, [[0, ROBOT.eyeCore], [0.45, ROBOT.eye], [1, ROBOT.eyeDeep]]);
  for (const [index, eye] of EYE_POSITIONS.entries()) {
    const mirror = index === 0 ? 1 : -1;
    if (expression !== 'dead') glow(ctx, eye.x, eye.y, expression === 'surprised' ? 9 : 7.5, ROBOT.eye, expression === 'blink' ? 0.25 : 0.4);
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = ROBOT.eye;
    if (expression === 'normal') {
      roundRect(ctx, eye.x - eye.w / 2, eye.y - eye.h / 2, eye.w, eye.h, eye.w / 2);
      ctx.fillStyle = eyeFill(eye.y - eye.h / 2, eye.y + eye.h / 2);
      ctx.fill();
    } else if (expression === 'blink') {
      roundRect(ctx, eye.x - 3.8, eye.y + 0.5, 7.6, 1.9, 0.95);
      ctx.fillStyle = ROBOT.eye;
      ctx.fill();
    } else if (expression === 'happy') {
      ctx.beginPath();
      ctx.arc(eye.x, eye.y + 3, 3.7, Math.PI * 1.12, Math.PI * 1.88);
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
      ellipse(ctx, eye.x - eye.w * 0.18, eye.y - eye.h * 0.24, 1.25, 1.25);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
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
  glow(ctx, 11, 7.5, 6, ROBOT.eye, 0.35);
  ellipse(ctx, 11, 7.5, 2.6, 2.6);
  fillStroke(ctx, radial(ctx, 11, 7.5, 2.6, [[0, ROBOT.eyeCore], [1, ROBOT.eyeDeep]]), 1);
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
  [ROBOT_PARTS.fin, paintFin],
  [ROBOT_PARTS.torso, paintTorso],
  [ROBOT_PARTS.arm, paintArm],
  [ROBOT_PARTS.leg, paintLeg],
  [ROBOT_PARTS.wheel, paintWheel],
  [ROBOT_PARTS.ball, paintBall],
  [ROBOT_PARTS.ballShade, paintBallShade],
  [ROBOT_PARTS.shadow, paintShadow],
  ...ROBOT_EXPRESSIONS.map((expression): [PartSpec, (ctx: CanvasRenderingContext2D) => void] => [eyesPart(expression), (ctx) => paintEyes(ctx, expression)]),
];

// Each robot is the same painting in its own colours: the painters read ROBOT, which is swapped while they run.
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
  try { paint(); } finally { Object.assign(ROBOT, DEFAULT_PALETTE); }
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

// Idle pose composed from whatever part textures are active (painted or delivered PNG). Used by menus and UI.
function bakePortrait(scene: Phaser.Scene) {
  const source = (spec: PartSpec) => [scene.textures.get(spec.key).getSourceImage() as CanvasImageSource, artScale(spec.key)] as const;
  bake(scene, PORTRAIT_KEY, 64, 70, (ctx) => paintPortrait(source, ctx, 'normal'));
  bake(scene, PORTRAIT_BLINK_KEY, 64, 70, (ctx) => paintPortrait(source, ctx, 'blink'));
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
  const { canvas, ctx } = makeCanvas(64, 70, scale);
  paintPortrait((spec) => [parts.get(spec.key)!, scale], ctx, 'normal');
  const url = canvas.toDataURL();
  portraits.set(character.id, url);
  return url;
}

function paintPortrait(source: (spec: PartSpec) => readonly [CanvasImageSource, number], ctx: CanvasRenderingContext2D, expression: RobotExpression) {
  const feet = { x: 31, y: 66 };
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
  draw(eyesPart(expression), neck[0] + rig.eyes.x, neck[1] + rig.eyes.y);
  draw(ROBOT_PARTS.fin, neck[0] + rig.finNear.x, neck[1] + rig.finNear.y, rig.finNear.angle);
  draw(ROBOT_PARTS.arm, ...at(rig.shoulderFront), 12);
}
