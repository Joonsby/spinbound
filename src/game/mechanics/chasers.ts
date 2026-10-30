import Phaser from 'phaser';
import { artScale } from '../../graphics/art';
import { CHASE_KEYS, DRAGON } from '../../graphics/chase-art';
import { DEPTH } from '../../graphics/depth';
import { PHYSICS } from '../config';

// Chase-stage actors. Both run along the ground of a rightward stage and ignore physics.

const RUN = PHYSICS.runSpeed;
const fit = (image: Phaser.GameObjects.Image) => image.setScale(1 / artScale(image.texture.key));
const part = (scene: Phaser.Scene, key: string, spec: { width: number; height: number; ox: number; oy: number }, x = 0, y = 0) =>
  fit(scene.add.image(x, y, key).setOrigin(spec.ox / spec.width, spec.oy / spec.height));

// Starts behind the player, roars for a moment, then follows: quick to close a big lead,
// slower when near, so steady running escapes it and stopping does not.
const DRAGON_START_GAP = 520;
const DRAGON_HOLD_MS = 2400;

export class DragonChase {
  x = 0;
  private root: Phaser.GameObjects.Container;
  private jaw: Phaser.GameObjects.Image;
  private wing: Phaser.GameObjects.Image;
  private holdUntil = 0;

  constructor(scene: Phaser.Scene, private floor: number) {
    this.wing = part(scene, CHASE_KEYS.dragonWing, DRAGON.wing, DRAGON.wing.x, DRAGON.wing.y);
    this.jaw = part(scene, CHASE_KEYS.dragonJaw, DRAGON.jaw, DRAGON.jaw.x, DRAGON.jaw.y);
    const body = part(scene, CHASE_KEYS.dragonBody, DRAGON.body);
    this.root = scene.add.container(0, 0, [this.wing, this.jaw, body]).setDepth(DEPTH.player + 0.6);
  }

  reset(playerX: number, now: number) {
    this.x = playerX - DRAGON_START_GAP;
    this.holdUntil = now + DRAGON_HOLD_MS;
  }

  get mouthY() { return this.root.y + 18; }

  // Moves on; true once the snout reaches the player.
  update(now: number, deltaMs: number, playerX: number) {
    const gap = playerX - this.x;
    const speed = now < this.holdUntil ? 0 : gap > 650 ? RUN * 1.3 : gap < 260 ? RUN * 0.72 : RUN * 0.8;
    this.x += speed * Math.min(deltaMs, PHYSICS.maxStepMs) / 1000;
    const t = now / 1000;
    this.root.setPosition(this.x, this.floor - 150 + Math.sin(t * 2.2) * 8);
    this.wing.setAngle(Math.sin(t * 3) * 12);
    this.jaw.setAngle(gap < 320 ? 18 + Math.sin(t * 10) * 8 : 8 + Math.sin(t * 2) * 4);
    return gap < 10;
  }
}

// Runs ahead with the coins and pauses to taunt now and then; nearly as fast as a plain run,
// so rolling, dashing and boosters are what close the gap.
const THIEF_START_GAP = 450;
const THIEF_PAUSE_EVERY_MS = 6500;
const THIEF_PAUSE_MS = 900;

export class ThiefRun {
  x = 0;
  private image: Phaser.GameObjects.Image;
  private lift = 0;
  private pauseUntil = 0;
  private nextPause = 0;

  constructor(scene: Phaser.Scene, private floor: number, private goalX: number, private hasGround: (x: number) => boolean) {
    this.image = fit(scene.add.image(0, floor, CHASE_KEYS.thief).setOrigin(0.5, 47 / 48)).setDepth(DEPTH.enemy + 0.1);
  }

  reset(playerX: number, now: number) {
    this.x = Math.min(this.goalX - 400, playerX + THIEF_START_GAP);
    this.nextPause = now + THIEF_PAUSE_EVERY_MS;
    this.pauseUntil = 0;
  }

  update(now: number, deltaMs: number, playerX: number, playerY: number): 'caught' | 'escaped' | undefined {
    const dt = Math.min(deltaMs, PHYSICS.maxStepMs) / 1000;
    const gap = this.x - playerX;
    if (Math.abs(gap) < 34 && Math.abs(playerY - (this.image.y - 24)) < 50) return 'caught';
    if (now >= this.nextPause) {
      this.pauseUntil = now + THIEF_PAUSE_MS;
      this.nextPause = now + THIEF_PAUSE_EVERY_MS;
    }
    const paused = now < this.pauseUntil;
    const speed = paused ? 0 : gap > 600 ? RUN * 0.6 : gap < 200 ? RUN : RUN * 0.92;
    this.x += speed * dt;
    if (this.x >= this.goalX) return 'escaped';
    // Leaps over pits instead of falling in.
    this.lift += ((this.hasGround(this.x) ? 0 : 70) - this.lift) * (1 - Math.exp(-dt * 10));
    const t = now / 1000;
    const bob = paused ? Math.abs(Math.sin(t * 6)) * 3 : Math.abs(Math.sin(t * 14)) * 4;
    this.image.setPosition(this.x, this.floor - this.lift - bob).setAngle(paused ? Math.sin(t * 12) * 8 : 6);
    return undefined;
  }
}
