import Phaser from 'phaser';
import { GIMMICK, PHYSICS } from '../config';
import type { Player } from '../player';
import { PROP_KEYS } from '../../graphics/props-art';
import { artScale } from '../../graphics/art';
import { DEPTH } from '../../graphics/depth';

export type RopeConfig = { x: number; y: number; length: number };

// Hands sit this far below the top of the player body.
const HAND_OFFSET = 6;
const IDLE_SWAY = 0.12;

// Kinematic pendulum (no rope physics): the swing angle is integrated here and the
// player body is placed on the arc each frame while gravity is switched off.
export class SwingRope {
  held = false;
  private graphics: Phaser.GameObjects.Graphics;
  private hook: Phaser.GameObjects.Image;
  private angle = 0;
  private angularVelocity = 0;
  private grip = 0;
  private grabbedAt = 0;
  private regrabAt = 0;

  constructor(scene: Phaser.Scene, private config: RopeConfig) {
    this.graphics = scene.add.graphics().setDepth(DEPTH.prop);
    scene.add.image(config.x, config.y, PROP_KEYS.ropeAnchor).setOrigin(0.5, 0.35).setDepth(DEPTH.prop + 0.2).setScale(1 / artScale(PROP_KEYS.ropeAnchor));
    this.hook = scene.add.image(config.x, config.y + config.length, PROP_KEYS.ropeHook).setOrigin(0.5, 2.5 / 22).setDepth(DEPTH.player + 0.2).setScale(1 / artScale(PROP_KEYS.ropeHook));
  }

  get tilt() { return this.held ? -Phaser.Math.RadToDeg(this.angle) : 0; }

  tryGrab(player: Player, now: number) {
    if (this.held || player.held || player.dead || now < this.regrabAt || player.isHurt(now) || player.isGrounded(now)) return false;
    const { body } = player;
    const { x: ax, y: ay, length } = this.config;
    const hx = body.center.x;
    const hy = body.top + HAND_OFFSET;
    // Nearest point on the lower part of the rope.
    const along = Phaser.Math.Clamp((hx - ax) * Math.sin(this.angle) + (hy - ay) * Math.cos(this.angle), length * GIMMICK.ropeMinGrip, length);
    const px = ax + Math.sin(this.angle) * along;
    const py = ay + Math.cos(this.angle) * along;
    if (Phaser.Math.Distance.Between(hx, hy, px, py) > GIMMICK.ropeGrabRadius) return false;
    this.grip = Phaser.Math.Clamp(Math.hypot(hx - ax, hy - ay), length * GIMMICK.ropeMinGrip, length);
    this.angle = Phaser.Math.Clamp(Math.atan2(hx - ax, hy - ay), -GIMMICK.ropeMaxAngle, GIMMICK.ropeMaxAngle);
    // Carry the incoming momentum into the swing, capped so it never loops over the anchor.
    const tangential = body.velocity.x * Math.cos(this.angle) - body.velocity.y * Math.sin(this.angle);
    const limit = Math.sqrt(2 * PHYSICS.gravity / this.grip * (1 - Math.cos(GIMMICK.ropeMaxAngle)));
    this.angularVelocity = Phaser.Math.Clamp(tangential / this.grip, -limit, limit);
    this.held = true;
    this.grabbedAt = now;
    player.held = true;
    player.rolling = false;
    body.setAllowGravity(false);
    this.place(player);
    return true;
  }

  // Only a jump press after the catch frame releases: holding jump into the rope never drops the player.
  canRelease(now: number) { return this.held && now > this.grabbedAt; }

  update(now: number, deltaMs: number, player: Player, direction: number) {
    if (!this.held) {
      this.angle = Math.sin(now / 1000 * Math.sqrt(PHYSICS.gravity / this.config.length)) * IDLE_SWAY;
      return;
    }
    const dt = Math.min(deltaMs, PHYSICS.maxStepMs) / 1000;
    this.angularVelocity += (-(PHYSICS.gravity / this.grip) * Math.sin(this.angle) + direction * GIMMICK.ropePump) * dt;
    this.angle += this.angularVelocity * dt;
    if (Math.abs(this.angle) > GIMMICK.ropeMaxAngle) {
      this.angle = Math.sign(this.angle) * GIMMICK.ropeMaxAngle;
      this.angularVelocity = 0;
    }
    this.place(player);
  }

  private place(player: Player) {
    const { x, y } = this.config;
    const sin = Math.sin(this.angle);
    const cos = Math.cos(this.angle);
    const reach = this.grip + player.body.halfHeight - HAND_OFFSET;
    player.body.reset(x + sin * reach, y + cos * reach);
    const speed = this.grip * this.angularVelocity;
    player.body.setVelocity(speed * cos, -speed * sin);
  }

  release(player: Player, now: number, direction: number) {
    const speed = this.grip * this.angularVelocity * GIMMICK.ropeReleaseScale;
    const vx = Phaser.Math.Clamp(speed * Math.cos(this.angle) + direction * GIMMICK.ropeReleaseSteer, -GIMMICK.ropeMaxReleaseX, GIMMICK.ropeMaxReleaseX);
    const vy = Math.max(-GIMMICK.ropeMaxReleaseUp, -speed * Math.sin(this.angle) - GIMMICK.ropeReleaseJump);
    this.detach(player, now);
    player.launch(now, vx, vy);
  }

  // Drop without an impulse (damage, death, respawn).
  detach(player: Player, now: number) {
    if (!this.held) return;
    this.held = false;
    this.regrabAt = now + GIMMICK.ropeRegrabMs;
    player.held = false;
    player.body.setAllowGravity(true);
  }

  reset() {
    this.held = false;
    this.angle = this.angularVelocity = 0;
    this.regrabAt = 0;
  }

  draw(view: Phaser.Geom.Rectangle, now: number) {
    const { x, y, length } = this.config;
    const visible = x + length >= view.left && x - length <= view.right;
    this.graphics.setVisible(visible);
    this.hook.setVisible(visible);
    if (!visible) return;
    const g = this.graphics;
    const sin = Math.sin(this.angle);
    const cos = Math.cos(this.angle);
    const tipX = x + sin * length;
    const tipY = y + cos * length;
    g.clear();
    g.lineStyle(6, 0x2b2236);
    g.lineBetween(x, y, tipX, tipY);
    g.lineStyle(4, 0x9a6a3e);
    g.lineBetween(x, y, tipX, tipY);
    // Twisted strands: short light dashes along the rope.
    g.lineStyle(1.6, 0xe2bd88);
    for (let d = 8; d < length - 6; d += 9) {
      const px = x + sin * d;
      const py = y + cos * d;
      g.lineBetween(px - cos * 1.6 - sin * 2, py + sin * 1.6 - cos * 2, px + cos * 1.6 + sin * 2, py - sin * 1.6 + cos * 2);
    }
    this.hook.setPosition(tipX, tipY).setRotation(-this.angle);
    if (!this.held && now >= this.regrabAt) {
      g.lineStyle(2, 0xfff3c4, 0.35 + Math.sin(now / 180) * 0.2);
      g.strokeCircle(tipX + sin * 8, tipY + cos * 8, 16);
    }
  }
}
