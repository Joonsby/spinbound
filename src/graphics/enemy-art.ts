import Phaser from 'phaser';
import { artScale, bake, ellipse, fillStroke, linear, roundRect, star } from './art';
import { DEPTH } from './depth';
import { ROBOT_PARTS } from './asset-manifest';
import { bakeSpecies, speciesKey, type Species } from './monster-art';
import type { EnemyKind } from '../stages';

// TEMPORARY ART: monster bodies live in monster-art.ts; this file has the shared status marks
// and the visual that animates any species.

type Ctx = CanvasRenderingContext2D;

export const ENEMY_KEYS = {
  alert: 'enemy-alert',
  dizzy: 'enemy-dizzy',
};

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

export function createEnemyArt(scene: Phaser.Scene) {
  bake(scene, ENEMY_KEYS.alert, 15, 24, paintAlert);
  bake(scene, ENEMY_KEYS.dizzy, 30, 12, paintDizzy);
}

const fit = (image: Phaser.GameObjects.Image, scale = 1) => image.setScale(scale / artScale(image.texture.key));

export type EnemyPose = { now: number; x: number; bottom: number; centerY: number; groundY: number; vx: number; facing: number; state: 'idle' | 'windup' | 'charge' | 'recover' };

// Parts and tweens only, no frame swaps: the shapes stay identical while they bob, flap, hop and lean.
export class EnemyVisual {
  readonly root: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Image;
  private wings: { image: Phaser.GameObjects.Image; flip: boolean }[] = [];
  private alert?: Phaser.GameObjects.Image;
  private dizzy?: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private flashUntil = 0;
  private flashing = false;
  private phase = Math.random() * Math.PI * 2;
  dying = false;

  constructor(private scene: Phaser.Scene, readonly kind: EnemyKind, private species: Species, x: number, y: number) {
    bakeSpecies(scene, species);
    const { body, wings } = species;
    this.shadow = fit(scene.add.image(x, y, ROBOT_PARTS.shadow.key).setDepth(DEPTH.shadow), kind === 'fly' ? 0.7 : body.width / 42);
    this.root = scene.add.container(x, y).setDepth(DEPTH.enemy);
    if (wings) {
      for (const [wx, wy, flip] of wings.anchors) {
        const image = fit(scene.add.image(wx, wy, speciesKey(species, 'wing')));
        image.setOrigin(flip ? 1 - wings.ox / wings.width : wings.ox / wings.width, wings.oy / wings.height).setFlipX(flip);
        this.wings.push({ image, flip });
        this.root.add(image);
      }
    }
    this.body = fit(scene.add.image(0, 0, speciesKey(species, 'body')).setOrigin(body.ox / body.width, body.oy / body.height));
    this.root.add(this.body);
    if (kind === 'charger') {
      this.alert = fit(scene.add.image(4, -body.height - 12, ENEMY_KEYS.alert).setVisible(false));
      this.dizzy = fit(scene.add.image(0, -body.height - 6, ENEMY_KEYS.dizzy).setVisible(false));
      this.root.add([this.alert, this.dizzy]);
    }
  }

  flash(now: number) { this.flashUntil = now + 90; }

  update(pose: EnemyPose) {
    if (this.dying) return;
    const t = pose.now / 1000;
    const facing = pose.facing < 0 ? -1 : 1;
    const base = 1 / artScale(this.body.texture.key);
    if (this.kind === 'fly') {
      this.root.setPosition(pose.x, pose.centerY).setScale(facing, 1);
      const wings = this.species.wings;
      if (wings) {
        const beat = Math.sin(t * wings.speed + this.phase);
        for (const { image, flip } of this.wings) {
          if (wings.motion === 'spin') image.setScale(Math.max(0.15, Math.abs(Math.cos(t * wings.speed + (flip ? 1 : 0)))) * base, base);
          else image.setAngle((flip ? -1 : 1) * beat * wings.amp);
        }
      } else {
        // Wingless flyers (ghosts, wisps) sway and breathe instead.
        const breathe = Math.sin(t * 5 + this.phase) * 0.05;
        this.body.setAngle(Math.sin(t * 2.4 + this.phase) * 6).setScale(base * (1 + breathe), base * (1 - breathe));
      }
      this.shadow.setVisible(false);
    } else {
      this.root.setPosition(pose.x, pose.bottom);
      let squash = 0;
      let angle = 0;
      let shake = 0;
      if (this.kind === 'patrol') squash = Math.abs(Math.sin(t * 6 + this.phase)) * 0.08;
      else if (this.kind === 'hopper') squash = pose.state === 'windup' ? 0.16 : pose.state === 'charge' ? -0.12 : Math.sin(t * 4 + this.phase) * 0.03;
      else if (pose.state === 'windup') { squash = 0.14; shake = Math.sin(t * 70) * 1.2; }
      else if (pose.state === 'charge') angle = 8;
      else if (pose.state === 'recover') angle = Math.sin(t * 8) * 4;
      else squash = Math.sin(t * 3 + this.phase) * 0.03;
      this.body.setPosition(shake, 0).setAngle(angle).setScale((1 + squash) * base, (1 - squash) * base);
      this.root.setScale(facing, 1);
      if (this.alert) this.alert.setVisible(pose.state === 'windup').setY(-this.species.body.height - 12 + Math.sin(t * 12) * 2);
      if (this.dizzy) this.dizzy.setVisible(pose.state === 'recover').setAngle(t * 140 % 360 > 180 ? 6 : -6).setScale((1 + Math.sin(t * 9) * 0.06) / artScale(ENEMY_KEYS.dizzy));
      const lift = Math.max(0, pose.groundY - pose.bottom);
      this.shadow.setVisible(true).setPosition(pose.x, pose.groundY).setAlpha(Math.max(0.3, 1 - lift / 90));
    }
    const flashing = pose.now < this.flashUntil;
    if (flashing !== this.flashing) {
      this.flashing = flashing;
      for (const image of [this.body, ...this.wings.map((wing) => wing.image)]) if (flashing) image.setTintFill(0xffffff); else image.clearTint();
    }
  }

  // Pop up, spin and shrink away from the hit.
  defeat(fromX: number) {
    this.dying = true;
    this.shadow.setVisible(false);
    this.alert?.setVisible(false);
    this.dizzy?.setVisible(false);
    for (const image of [this.body, ...this.wings.map((wing) => wing.image)]) image.setTintFill(0xffffff);
    const direction = fromX < this.root.x ? 1 : -1;
    this.scene.tweens.add({
      targets: this.root, x: this.root.x + direction * 44, y: this.root.y - 46, angle: direction * 160, scaleX: 0.2 * Math.sign(this.root.scaleX || 1), scaleY: 0.2, alpha: 0,
      duration: 380, ease: 'Quad.easeIn', onComplete: () => this.root.setVisible(false),
    });
  }
}
