import Phaser from 'phaser';
import { bake, ellipse, fillStroke, glow, linear, radial, roundRect, star } from './art';
import { INK, PROP, ROBOT } from './palette';

// TEMPORARY ART: code-painted gameplay props following the reference object sheet
// (red-cap spring, blue chevron booster, hook rope, stone breakable wall, crystal checkpoint).

type Ctx = CanvasRenderingContext2D;

export const PROP_KEYS = {
  coin: (frame: number) => `prop-coin-${frame}`,
  coinSpin: 'prop-coin-spin',
  star: 'prop-star',
  spike: 'prop-spike',
  spring: 'prop-spring',
  boost: (frame: number) => `prop-boost-${frame}`,
  boostFlow: 'prop-boost-flow',
  wall: 'prop-wall',
  ropeAnchor: 'prop-rope-anchor',
  ropeHook: 'prop-rope-hook',
  platform: 'prop-platform',
  flame: 'prop-flame',
  checkpointBase: 'prop-checkpoint-base',
  crystal: 'prop-crystal',
  goal: 'prop-goal',
  portal: 'prop-portal',
  sign: 'prop-sign',
  post: 'prop-sign-post',
};
export const COIN_FRAMES = 8;
export const BOOST_FRAMES = 4;
export const SIGN_SLICE = 10;

function paintCoin(ctx: Ctx, frame: number) {
  const turn = Math.cos(frame / COIN_FRAMES * Math.PI);
  const width = Math.max(2.6, Math.abs(turn) * 11);
  const [light, base, dark] = PROP.gold;
  ellipse(ctx, 14, 15, width + 1, 12);
  ctx.fillStyle = dark;
  ctx.fill();
  ellipse(ctx, 14, 14, width, 12);
  fillStroke(ctx, linear(ctx, 14 - width, 2, 14 + width, 26, [[0, light], [0.45, base], [1, dark]]), 1.6);
  if (width > 6) {
    ellipse(ctx, 14, 14, width - 3, 9);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(160,90,20,0.55)';
    ctx.stroke();
    ctx.save();
    ctx.translate(14, 14);
    ctx.scale(width / 11, 1);
    star(ctx, 0, 0.5, 5, 2.2);
    ctx.fillStyle = 'rgba(255,248,210,0.95)';
    ctx.fill();
    ctx.restore();
  }
  ellipse(ctx, 14 - width * 0.45, 8, Math.max(1, width * 0.22), 3, -0.3);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fill();
}

function paintStar(ctx: Ctx) {
  const [light, base, dark] = PROP.gold;
  glow(ctx, 20, 21, 20, '#FFE7A0', 0.45);
  ctx.save();
  star(ctx, 20, 21.5, 16, 7.4);
  ctx.lineJoin = 'round';
  fillStroke(ctx, radial(ctx, 20, 21, 17, [[0, light], [0.5, base], [1, dark]], 15, 14, 0), 2.2);
  ctx.restore();
  star(ctx, 18, 17, 6, 2.6);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fill();
}

function paintSpike(ctx: Ctx) {
  roundRect(ctx, 1, 23, 34, 6, 2.5);
  fillStroke(ctx, linear(ctx, 0, 23, 0, 29, [[0, '#7E6A86'], [1, '#4D3F57']]), 1.6);
  for (const x of [8, 18, 28]) {
    ctx.beginPath();
    ctx.moveTo(x - 6, 24);
    ctx.lineTo(x, 3);
    ctx.lineTo(x + 6, 24);
    ctx.closePath();
    fillStroke(ctx, linear(ctx, x - 6, 0, x + 6, 0, [[0, '#F3F1F6'], [0.5, '#C2BCCB'], [0.51, '#8E869C'], [1, '#6B6378']]), 1.6);
  }
  for (const x of [6, 30]) {
    ellipse(ctx, x, 26, 1.2, 1.2);
    ctx.fillStyle = '#C9BFD2';
    ctx.fill();
  }
}

function paintSpring(ctx: Ctx) {
  const [capLight, cap, capDark] = PROP.springCap;
  const [coilLight, coil, coilDark] = PROP.springCoil;
  roundRect(ctx, 6, 19, 54, 6, 3);
  fillStroke(ctx, linear(ctx, 0, 19, 0, 25, [[0, '#B9C2CF'], [1, '#6E7888']]), 1.6);
  ctx.lineWidth = 4.2;
  ctx.strokeStyle = INK;
  const coilPath = () => {
    ctx.beginPath();
    ctx.moveTo(18, 19);
    for (let i = 0; i < 5; i++) {
      ctx.lineTo(i % 2 ? 18 : 48, 19 - (i + 1) * 2.4);
    }
    ctx.lineTo(33, 7);
  };
  coilPath();
  ctx.stroke();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = linear(ctx, 0, 6, 0, 20, [[0, coilLight], [0.5, coil], [1, coilDark]]);
  coilPath();
  ctx.stroke();
  roundRect(ctx, 8, 1.5, 50, 8, 4);
  fillStroke(ctx, linear(ctx, 0, 1.5, 0, 9.5, [[0, capLight], [0.55, cap], [1, capDark]]), 2);
  roundRect(ctx, 13, 3, 24, 2, 1);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fill();
}

function paintBoost(ctx: Ctx, frame: number) {
  const [light, base, dark] = PROP.boost;
  roundRect(ctx, 1, 2, 64, 10, 4);
  fillStroke(ctx, linear(ctx, 0, 2, 0, 12, [[0, '#46597A'], [1, '#26324A']]), 1.6);
  ctx.save();
  roundRect(ctx, 3, 3.5, 60, 7, 3);
  ctx.clip();
  const shift = frame / BOOST_FRAMES * 16;
  for (let x = -16 + shift; x < 70; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, 3.5);
    ctx.lineTo(x + 6, 7);
    ctx.lineTo(x, 10.5);
    ctx.lineTo(x + 4, 10.5);
    ctx.lineTo(x + 10, 7);
    ctx.lineTo(x + 4, 3.5);
    ctx.closePath();
    ctx.fillStyle = linear(ctx, x, 0, x + 10, 0, [[0, base], [1, light]]);
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = dark;
  ctx.fillRect(4, 11, 58, 1);
}

function paintWall(ctx: Ctx) {
  const [light, base, dark] = PROP.stone;
  ctx.fillStyle = dark;
  ctx.fillRect(1, 1, 34, 78);
  const rows = [0, 20, 40, 60];
  rows.forEach((y, row) => {
    const offset = row % 2 ? -9 : 0;
    for (let x = offset; x < 36; x += 18) {
      const left = Math.max(2, x + 1.5);
      const right = Math.min(34, x + 17);
      if (right - left < 4) continue;
      roundRect(ctx, left, y + 2, right - left, 17, 3);
      ctx.fillStyle = linear(ctx, left, y, right, y + 19, [[0, light], [0.6, base], [1, dark]]);
      ctx.fill();
    }
  });
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = '#3B2F45';
  ctx.beginPath();
  ctx.moveTo(9, 14); ctx.lineTo(16, 30); ctx.lineTo(12, 44); ctx.moveTo(16, 30); ctx.lineTo(27, 38); ctx.lineTo(24, 56); ctx.lineTo(16, 70);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,214,150,0.55)';
  ctx.beginPath();
  ctx.moveTo(15, 30); ctx.lineTo(19, 33); ctx.lineTo(14, 36);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#7DBE62';
  for (const [x, w] of [[3, 12], [16, 9], [27, 7]] as const) {
    ellipse(ctx, x + w / 2, 3, w / 2, 3);
    ctx.fill();
  }
  roundRect(ctx, 1, 1, 34, 78, 3);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function paintRopeAnchor(ctx: Ctx) {
  roundRect(ctx, 2, 2, 22, 10, 4);
  fillStroke(ctx, linear(ctx, 0, 2, 0, 12, [[0, '#9AA4B3'], [1, '#5A6474']]), 1.6);
  for (const x of [6, 20]) {
    ellipse(ctx, x, 7, 1.4, 1.4);
    ctx.fillStyle = '#2C3240';
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(13, 15, 5, 0, Math.PI * 2);
  ctx.lineWidth = 3.6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#C7D0DC';
  ctx.stroke();
}

function paintRopeHook(ctx: Ctx) {
  const hook = () => {
    ctx.beginPath();
    ctx.moveTo(9, 2);
    ctx.lineTo(9, 10);
    ctx.arc(9, 15, 5.5, -Math.PI / 2, Math.PI * 0.95, false);
  };
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  hook();
  ctx.stroke();
  ctx.lineWidth = 2.8;
  ctx.strokeStyle = linear(ctx, 0, 0, 18, 22, [[0, '#E6ECF3'], [1, '#7E8999']]);
  hook();
  ctx.stroke();
  ellipse(ctx, 9, 2.5, 3, 2.4);
  fillStroke(ctx, '#B9C2CF', 1.4);
}

function paintPlatform(ctx: Ctx) {
  roundRect(ctx, 1, 2, 108, 14, 6);
  fillStroke(ctx, linear(ctx, 0, 2, 0, 16, [[0, '#C9D1DC'], [0.5, '#8D97A8'], [1, '#5A6474']]), 2);
  ctx.save();
  roundRect(ctx, 1, 2, 108, 14, 6);
  ctx.clip();
  ctx.fillStyle = ROBOT.orange;
  for (let x = 6; x < 110; x += 14) {
    ctx.beginPath();
    ctx.moveTo(x, 12); ctx.lineTo(x + 6, 12); ctx.lineTo(x + 10, 16); ctx.lineTo(x + 4, 16);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(8, 4, 94, 1.6);
  for (const x of [14, 55, 96]) {
    glow(ctx, x, 9, 5, ROBOT.eye, 0.5);
    ellipse(ctx, x, 9, 2, 2);
    ctx.fillStyle = ROBOT.eyeCore;
    ctx.fill();
  }
  roundRect(ctx, 44, 15, 22, 6, 2);
  fillStroke(ctx, '#4A5466', 1.4);
}

function paintFlame(ctx: Ctx) {
  ctx.beginPath();
  ctx.moveTo(4, 0);
  ctx.quadraticCurveTo(10, 18, 10, 18);
  ctx.quadraticCurveTo(10, 18, 16, 0);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, 0, 0, 18, [[0, 'rgba(255,240,160,0.95)'], [0.5, 'rgba(255,170,70,0.7)'], [1, 'rgba(255,120,60,0)']]);
  ctx.fill();
}

function paintCheckpointBase(ctx: Ctx) {
  const [light, base, dark] = PROP.stone;
  ctx.beginPath();
  ctx.moveTo(4, 26); ctx.lineTo(8, 12); ctx.lineTo(32, 12); ctx.lineTo(36, 26);
  ctx.closePath();
  fillStroke(ctx, linear(ctx, 0, 12, 0, 26, [[0, light], [0.5, base], [1, dark]]), 2);
  roundRect(ctx, 6, 8, 28, 6, 3);
  fillStroke(ctx, linear(ctx, 0, 8, 0, 14, [[0, '#E9E4D8'], [1, base]]), 1.8);
  ctx.fillStyle = '#7DBE62';
  ellipse(ctx, 11, 12.5, 5, 2);
  ctx.fill();
}

function paintCrystal(ctx: Ctx) {
  const [light, base, dark] = PROP.crystal;
  ctx.beginPath();
  ctx.moveTo(11, 1); ctx.lineTo(19, 12); ctx.lineTo(15, 34); ctx.lineTo(7, 34); ctx.lineTo(3, 12);
  ctx.closePath();
  fillStroke(ctx, linear(ctx, 3, 0, 19, 34, [[0, light], [0.45, base], [1, dark]]), 2);
  ctx.beginPath();
  ctx.moveTo(11, 1); ctx.lineTo(11, 34); ctx.moveTo(3, 12); ctx.lineTo(11, 16); ctx.lineTo(19, 12);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(6, 13); ctx.lineTo(10, 15); ctx.lineTo(9, 28);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fill();
}

function paintGoal(ctx: Ctx) {
  const [light, base, dark] = PROP.stone;
  for (const x of [14, 96]) {
    roundRect(ctx, x - 12, 52, 24, 98, 4);
    fillStroke(ctx, linear(ctx, x - 12, 0, x + 12, 0, [[0, light], [0.6, base], [1, dark]]), 2.2);
    ctx.strokeStyle = 'rgba(59,47,69,0.6)';
    ctx.lineWidth = 1.2;
    for (let y = 72; y < 150; y += 22) { ctx.beginPath(); ctx.moveTo(x - 11, y); ctx.lineTo(x + 11, y); ctx.stroke(); }
  }
  ctx.beginPath();
  ctx.arc(55, 62, 54, Math.PI, 0);
  ctx.arc(55, 62, 33, 0, Math.PI, true);
  ctx.closePath();
  fillStroke(ctx, linear(ctx, 0, 8, 0, 62, [[0, light], [1, base]]), 2.2);
  roundRect(ctx, 46, 3, 18, 16, 4);
  fillStroke(ctx, linear(ctx, 0, 3, 0, 19, [[0, '#E2FBFF'], [1, '#2F7FD8']]), 1.8);
  ctx.fillStyle = '#7DBE62';
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI + (i + 0.5) * Math.PI / 6;
    ellipse(ctx, 55 + Math.cos(angle) * 44, 62 + Math.sin(angle) * 44, 6, 3.4, angle + Math.PI / 2);
    ctx.fill();
  }
}

function paintPortal(ctx: Ctx) {
  ellipse(ctx, 32, 52, 30, 50);
  ctx.fillStyle = radial(ctx, 32, 52, 50, [[0, 'rgba(233,255,255,0.85)'], [0.5, 'rgba(92,242,255,0.45)'], [1, 'rgba(47,127,216,0.05)']]);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(233,255,255,0.6)';
  for (let i = 0; i < 3; i++) {
    ellipse(ctx, 32, 52, 24 - i * 7, 42 - i * 12);
    ctx.stroke();
  }
}

function paintSign(ctx: Ctx) {
  const [light, base, dark] = PROP.wood;
  roundRect(ctx, 1.5, 1.5, 61, 37, 7);
  fillStroke(ctx, linear(ctx, 0, 1.5, 0, 38.5, [[0, light], [0.5, base], [1, dark]]), 2.4);
  roundRect(ctx, 5, 5, 54, 30, 5);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(255,230,190,0.45)';
  ctx.stroke();
}

function paintPost(ctx: Ctx) {
  const [, base, dark] = PROP.wood;
  roundRect(ctx, 2, 0, 8, 40, 3);
  fillStroke(ctx, linear(ctx, 2, 0, 10, 0, [[0, base], [1, dark]]), 1.8);
}

export function createPropArt(scene: Phaser.Scene) {
  for (let frame = 0; frame < COIN_FRAMES; frame++) bake(scene, PROP_KEYS.coin(frame), 28, 28, (ctx) => paintCoin(ctx, frame));
  for (let frame = 0; frame < BOOST_FRAMES; frame++) bake(scene, PROP_KEYS.boost(frame), 66, 14, (ctx) => paintBoost(ctx, frame));
  bake(scene, PROP_KEYS.star, 40, 42, paintStar);
  bake(scene, PROP_KEYS.spike, 36, 30, paintSpike);
  bake(scene, PROP_KEYS.spring, 66, 26, paintSpring);
  bake(scene, PROP_KEYS.wall, 36, 80, paintWall);
  bake(scene, PROP_KEYS.ropeAnchor, 26, 22, paintRopeAnchor);
  bake(scene, PROP_KEYS.ropeHook, 18, 22, paintRopeHook);
  bake(scene, PROP_KEYS.platform, 110, 22, paintPlatform);
  bake(scene, PROP_KEYS.flame, 20, 18, paintFlame);
  bake(scene, PROP_KEYS.checkpointBase, 40, 28, paintCheckpointBase);
  bake(scene, PROP_KEYS.crystal, 22, 36, paintCrystal);
  bake(scene, PROP_KEYS.goal, 110, 152, paintGoal);
  bake(scene, PROP_KEYS.portal, 64, 104, paintPortal);
  bake(scene, PROP_KEYS.sign, 64, 40, paintSign);
  bake(scene, PROP_KEYS.post, 12, 40, paintPost);
  if (!scene.anims.exists(PROP_KEYS.coinSpin)) {
    scene.anims.create({ key: PROP_KEYS.coinSpin, frames: Array.from({ length: COIN_FRAMES }, (_, i) => ({ key: PROP_KEYS.coin(i) })), frameRate: 12, repeat: -1 });
    scene.anims.create({ key: PROP_KEYS.boostFlow, frames: Array.from({ length: BOOST_FRAMES }, (_, i) => ({ key: PROP_KEYS.boost(i) })), frameRate: 10, repeat: -1 });
  }
}

