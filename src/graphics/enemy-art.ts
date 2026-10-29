import Phaser from 'phaser';
import { artScale, bake, ellipse, fillStroke, glow, linear, radial, roundRect, star } from './art';
import { DEPTH } from './depth';
import { ENEMY, INK } from './palette';
import { ROBOT_PARTS } from './asset-manifest';
import type { EnemyKind } from '../stages';

// TEMPORARY ART: code-painted monsters after the reference sheet
// (slime = patrol, bat = fly, hedgehog = charger) plus the boss drone.

type Ctx = CanvasRenderingContext2D;

export const ENEMY_KEYS = {
  slime: 'enemy-slime',
  batBody: 'enemy-bat-body',
  batWing: 'enemy-bat-wing',
  hedgehog: 'enemy-hedgehog',
  alert: 'enemy-alert',
  dizzy: 'enemy-dizzy',
  drone: 'boss-drone',
};

function eye(ctx: Ctx, x: number, y: number, rx: number, ry: number, lookX = 1) {
  ellipse(ctx, x, y, rx, ry);
  fillStroke(ctx, '#FFFFFF', 1.2);
  ellipse(ctx, x + lookX * rx * 0.3, y + ry * 0.15, rx * 0.55, ry * 0.55);
  ctx.fillStyle = '#2B2236';
  ctx.fill();
  ellipse(ctx, x + lookX * rx * 0.1, y - ry * 0.2, rx * 0.2, rx * 0.2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
}

function paintSlime(ctx: Ctx) {
  const [light, base, dark] = ENEMY.slime;
  ctx.beginPath();
  ctx.moveTo(4, 33);
  ctx.quadraticCurveTo(1.5, 19, 11, 10);
  ctx.quadraticCurveTo(22, 0.5, 33, 10);
  ctx.quadraticCurveTo(42.5, 19, 40, 33);
  ctx.quadraticCurveTo(22, 36.5, 4, 33);
  ctx.closePath();
  fillStroke(ctx, radial(ctx, 22, 20, 24, [[0, light], [0.55, base], [1, dark]], 14, 11, 0), 2.2);
  ellipse(ctx, 13, 12, 5, 2.8, -0.7);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fill();
  ellipse(ctx, 9.5, 17, 1.4, 1.4);
  ctx.fill();
  eye(ctx, 20, 18, 3.8, 4.8);
  eye(ctx, 30, 18, 3.6, 4.6);
  ctx.beginPath();
  ctx.arc(25.5, 24.5, 3, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = INK;
  ctx.stroke();
  for (const x of [15, 36]) {
    ellipse(ctx, x, 25, 2.4, 1.4);
    ctx.fillStyle = 'rgba(255,140,170,0.55)';
    ctx.fill();
  }
}

function paintBatBody(ctx: Ctx) {
  const [light, base, dark] = ENEMY.bat;
  for (const [x, dir] of [[9, -1], [21, 1]] as const) {
    ctx.beginPath();
    ctx.moveTo(x - 4, 9);
    ctx.lineTo(x + dir * 2, 1);
    ctx.lineTo(x + 4, 8);
    ctx.closePath();
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
    ctx.beginPath();
    ctx.moveTo(x - 1.3, 19); ctx.lineTo(x, 22.5); ctx.lineTo(x + 1.3, 19);
    ctx.closePath();
    ctx.fill();
  }
}

function paintBatWing(ctx: Ctx) {
  const [light, base, dark] = ENEMY.bat;
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
}

function paintHedgehog(ctx: Ctx) {
  const [light, base, dark] = ENEMY.hedgehog;
  for (let i = 0; i < 9; i++) {
    const angle = Math.PI * (0.95 + i * 0.07);
    const x = 22 + Math.cos(angle) * 15;
    const y = 24 + Math.sin(angle) * 12;
    const tipX = 22 + Math.cos(angle) * 25;
    const tipY = 24 + Math.sin(angle) * 22;
    ctx.beginPath();
    ctx.moveTo(x - Math.sin(angle) * 4.5, y + Math.cos(angle) * 4.5);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(x + Math.sin(angle) * 4.5, y - Math.cos(angle) * 4.5);
    ctx.closePath();
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
}

function paintAlert(ctx: Ctx) {
  roundRect(ctx, 4.5, 1.5, 6, 13.5, 3);
  fillStroke(ctx, linear(ctx, 0, 1, 0, 15, [[0, '#FFE07A'], [1, '#FF8A1F']]), 2);
  ellipse(ctx, 7.5, 19.5, 3, 3);
  fillStroke(ctx, '#FF8A1F', 2);
}

function paintDizzy(ctx: Ctx) {
  for (const [x, y, size] of [[5, 6, 4], [15, 4, 3.4], [25, 7, 4]] as const) {
    star(ctx, x, y, size, size * 0.45);
    fillStroke(ctx, '#FFE07A', 1.2);
  }
}

function paintDrone(ctx: Ctx) {
  ellipse(ctx, 16, 4, 11, 2.6);
  fillStroke(ctx, '#4A5466', 1.4);
  roundRect(ctx, 14.5, 4, 3, 6, 1);
  ctx.fillStyle = '#4A5466';
  ctx.fill();
  ellipse(ctx, 16, 17, 11, 10);
  fillStroke(ctx, radial(ctx, 16, 17, 12, [[0, '#E1E6EC'], [0.6, '#9AA3AE'], [1, '#5E6876']], 12, 13, 0), 2);
  glow(ctx, 19, 17, 7, '#FFD447', 0.5);
  ellipse(ctx, 19, 17, 4.2, 4.2);
  fillStroke(ctx, radial(ctx, 19, 17, 4.2, [[0, '#FFF6C4'], [1, '#F0A81C']]), 1.4);
  ellipse(ctx, 20, 17, 1.6, 1.6);
  ctx.fillStyle = INK;
  ctx.fill();
}

export function createEnemyArt(scene: Phaser.Scene) {
  bake(scene, ENEMY_KEYS.slime, 44, 36, paintSlime);
  bake(scene, ENEMY_KEYS.batBody, 30, 26, paintBatBody);
  bake(scene, ENEMY_KEYS.batWing, 26, 20, paintBatWing);
  bake(scene, ENEMY_KEYS.hedgehog, 48, 38, paintHedgehog);
  bake(scene, ENEMY_KEYS.alert, 15, 24, paintAlert);
  bake(scene, ENEMY_KEYS.dizzy, 30, 12, paintDizzy);
  bake(scene, ENEMY_KEYS.drone, 32, 28, paintDrone);
}

const fit = (image: Phaser.GameObjects.Image, scale = 1) => image.setScale(scale / artScale(image.texture.key));

export type EnemyPose = { now: number; x: number; bottom: number; centerY: number; vx: number; facing: number; state: 'idle' | 'windup' | 'charge' | 'recover' };

// Parts and tweens only, no frame swaps: the shapes stay identical while they bob, flap and lean.
export class EnemyVisual {
  readonly root: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Image;
  private wings: Phaser.GameObjects.Image[] = [];
  private alert?: Phaser.GameObjects.Image;
  private dizzy?: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private flashUntil = 0;
  private flashing = false;
  private phase = Math.random() * Math.PI * 2;
  dying = false;

  constructor(private scene: Phaser.Scene, readonly kind: EnemyKind, x: number, y: number) {
    this.shadow = fit(scene.add.image(x, y, ROBOT_PARTS.shadow.key).setDepth(DEPTH.shadow), kind === 'fly' ? 0.7 : 1.05);
    this.root = scene.add.container(x, y).setDepth(DEPTH.enemy);
    if (kind === 'fly') {
      for (const side of [-1, 1]) {
        const wing = fit(scene.add.image(side * 8, -2, ENEMY_KEYS.batWing).setOrigin(2 / 26, 8 / 20));
        wing.setFlipX(side < 0);
        if (side < 0) wing.setOrigin(1 - 2 / 26, 8 / 20);
        this.wings.push(wing);
        this.root.add(wing);
      }
      this.body = fit(scene.add.image(0, 0, ENEMY_KEYS.batBody).setOrigin(0.5, 15 / 26));
      this.root.add(this.body);
    } else {
      const key = kind === 'charger' ? ENEMY_KEYS.hedgehog : ENEMY_KEYS.slime;
      this.body = fit(scene.add.image(0, 0, key).setOrigin(0.5, kind === 'charger' ? 37 / 38 : 34 / 36));
      this.root.add(this.body);
      if (kind === 'charger') {
        this.alert = fit(scene.add.image(4, -50, ENEMY_KEYS.alert).setVisible(false));
        this.dizzy = fit(scene.add.image(0, -44, ENEMY_KEYS.dizzy).setVisible(false));
        this.root.add([this.alert, this.dizzy]);
      }
    }
  }

  flash(now: number) { this.flashUntil = now + 90; }

  update(pose: EnemyPose) {
    if (this.dying) return;
    const t = pose.now / 1000;
    const facing = pose.facing < 0 ? -1 : 1;
    if (this.kind === 'fly') {
      this.root.setPosition(pose.x, pose.centerY);
      const flap = Math.sin(t * 18 + this.phase);
      this.wings.forEach((wing, index) => wing.setAngle((index ? 1 : -1) * flap * 32));
      this.root.setScale(facing, 1);
      this.shadow.setVisible(false);
    } else {
      this.root.setPosition(pose.x, pose.bottom);
      let squash = 0;
      let angle = 0;
      let shake = 0;
      if (this.kind === 'patrol') squash = Math.abs(Math.sin(t * 6 + this.phase)) * 0.08;
      else if (pose.state === 'windup') { squash = 0.14; shake = Math.sin(t * 70) * 1.2; }
      else if (pose.state === 'charge') angle = 8;
      else if (pose.state === 'recover') angle = Math.sin(t * 8) * 4;
      else squash = Math.sin(t * 3 + this.phase) * 0.03;
      this.body.setPosition(shake, 0).setAngle(angle).setScale((1 + squash) / artScale(this.body.texture.key), (1 - squash) / artScale(this.body.texture.key));
      this.root.setScale(facing, 1);
      if (this.alert) this.alert.setVisible(pose.state === 'windup').setY(-50 + Math.sin(t * 12) * 2);
      if (this.dizzy) this.dizzy.setVisible(pose.state === 'recover').setAngle(t * 140 % 360 > 180 ? 6 : -6).setScale((1 + Math.sin(t * 9) * 0.06) / artScale(ENEMY_KEYS.dizzy));
      this.shadow.setVisible(true).setPosition(pose.x, pose.bottom);
    }
    const flashing = pose.now < this.flashUntil;
    if (flashing !== this.flashing) {
      this.flashing = flashing;
      for (const image of [this.body, ...this.wings]) if (flashing) image.setTintFill(0xffffff); else image.clearTint();
    }
  }

  // Pop up, spin and shrink away from the hit.
  defeat(fromX: number) {
    this.dying = true;
    this.shadow.setVisible(false);
    this.alert?.setVisible(false);
    this.dizzy?.setVisible(false);
    for (const image of [this.body, ...this.wings]) image.setTintFill(0xffffff);
    const direction = fromX < this.root.x ? 1 : -1;
    this.scene.tweens.add({
      targets: this.root, x: this.root.x + direction * 44, y: this.root.y - 46, angle: direction * 160, scaleX: 0.2 * Math.sign(this.root.scaleX || 1), scaleY: 0.2, alpha: 0,
      duration: 380, ease: 'Quad.easeIn', onComplete: () => this.root.setVisible(false),
    });
  }
}
