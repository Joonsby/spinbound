import Phaser from 'phaser';
import { COMBAT, PHYSICS } from './config';
import { applyBoost, createDashState, createJumpState, createRunState, cutJump, dashDirection, nextRolling, noteGrounded, pressJump, resetRun, stepRun, tryDash, tryJump } from './movement';
import { createContactBox } from './contact';
import type { InputFrame } from './input';

const GROUND_LOCK_MS = 120;
const RECOIL_LOCK_MS = 160;
const PLATFORM_CONTACT_MS = 50;
// Rope releases and diagonal springs may exceed the booster cap for a moment.
const MAX_SPEED_X = 480;

// Physics body; the drawn robot (RobotRig) is sized independently.
export const PLAYER_BODY = { width: 30, height: 42 };
export type PlayerPose = 'idle' | 'run' | 'jump' | 'fall' | 'roll' | 'hurt' | 'dead';
export type PlayerFrame = { jumped: boolean; landed: boolean; landingSpeed: number; dashed: boolean };

// Player physics state. Rendering lives in PlayerAnimator; HP and score live in the scene.
export class Player {
  readonly sprite: Phaser.GameObjects.Rectangle;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly run = createRunState();
  readonly jump = createJumpState();
  readonly dash = createDashState();
  rolling = false;
  // Set while a rope drives the position instead of physics.
  held = false;
  dead = false;
  facing: -1 | 1 = 1;
  boostUntil = 0;
  hurtUntil = 0;
  controlLockUntil = 0;
  invulnerableUntil = 0;
  private groundLockUntil = 0;
  private platformContactAt = -Infinity;
  private wasGrounded = false;
  private lastVy = 0;
  private box = createContactBox();
  private frame: PlayerFrame = { jumped: false, landed: false, landingSpeed: 0, dashed: false };

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.sprite = scene.add.rectangle(x, y, PLAYER_BODY.width, PLAYER_BODY.height, 0x69b9ff, 0).setDepth(2);
    scene.physics.add.existing(this.sprite);
    this.body = this.sprite.body as Phaser.Physics.Arcade.Body;
    this.body.setMaxVelocity(MAX_SPEED_X, PHYSICS.maxFallSpeed);
  }

  get x() { return this.body.center.x; }
  get y() { return this.body.center.y; }
  // touching.down is also raised by overlap-only checks (coins, spikes), so only real
  // separations count: blocked.down for static ground, the collider callback for moving platforms.
  isGrounded(now: number) { return (this.body.blocked.down || now - this.platformContactAt <= PLATFORM_CONTACT_MS) && now >= this.groundLockUntil; }
  noteMovingPlatform(now: number) { this.platformContactAt = now; }
  isHurt(now: number) { return now < this.hurtUntil; }
  isBoosted(now: number) { return now < this.boostUntil; }
  isInvulnerable(now: number) { return now < this.invulnerableUntil; }

  contactBox() {
    const { body, box } = this;
    box.x = body.x; box.y = body.y; box.prevX = body.prev.x; box.prevY = body.prev.y;
    box.width = body.width; box.height = body.height; box.vx = body.velocity.x; box.vy = body.velocity.y;
    return box;
  }

  // `carryVx` is the moving platform under the player; part of it is kept on take-off.
  update(now: number, deltaMs: number, input: InputFrame, carryVx: number): PlayerFrame {
    const { body, frame } = this;
    frame.jumped = false; frame.landed = false; frame.dashed = false;
    if (this.dead || this.held) return frame;
    const grounded = this.isGrounded(now);
    if (grounded && !this.wasGrounded) { frame.landed = true; frame.landingSpeed = this.lastVy; }
    this.wasGrounded = grounded;
    if (grounded) noteGrounded(this.jump, now);
    if (input.jumpPressed) pressJump(this.jump, now);
    if (now >= this.controlLockUntil) {
      // Read back what physics did last step (walls, recoils) before integrating input.
      this.run.vx = body.velocity.x;
      if (input.dash !== 0 && tryDash(PHYSICS, this.dash, this.run, input.dash, grounded, now) !== undefined) frame.dashed = true;
      const direction = dashDirection(this.dash, input.direction, now);
      if (direction !== 0) this.facing = direction;
      body.setVelocityX(stepRun(PHYSICS, this.run, direction, grounded, this.isBoosted(now), deltaMs));
      const jumpVy = tryJump(PHYSICS, this.jump, now);
      if (jumpVy !== undefined) {
        this.groundLockUntil = now + GROUND_LOCK_MS;
        this.wasGrounded = false;
        if (carryVx) { this.run.vx += carryVx * 0.8; body.setVelocityX(this.run.vx); }
        body.setVelocityY(jumpVy);
        frame.jumped = true;
      } else body.setVelocityY(cutJump(PHYSICS, this.jump, body.velocity.y, input.jumpHeld));
    }
    this.rolling = nextRolling(PHYSICS, {
      rolling: this.rolling, grounded: grounded && !frame.jumped, speed: Math.abs(body.velocity.x), blocked: this.isHurt(now),
    });
    this.lastVy = body.velocity.y;
    return frame;
  }

  pose(now: number): PlayerPose {
    if (this.dead) return 'dead';
    if (this.isHurt(now)) return 'hurt';
    if (this.rolling) return 'roll';
    if (this.held) return 'jump';
    if (!this.isGrounded(now)) return this.body.velocity.y < 0 ? 'jump' : 'fall';
    return Math.abs(this.body.velocity.x) > 8 ? 'run' : 'idle';
  }

  boost(now: number) {
    const direction = Math.abs(this.body.velocity.x) > 20 ? Math.sign(this.body.velocity.x) as -1 | 1 : this.facing;
    this.boostUntil = now + PHYSICS.boostMs;
    this.body.setVelocityX(applyBoost(PHYSICS, this.run, direction));
  }

  // Springs, rope releases and stomps: an impulse that a released jump button must not cut.
  launch(now: number, vx: number | undefined, vy: number) {
    if (vx !== undefined) { this.body.setVelocityX(vx); this.run.vx = vx; }
    this.body.setVelocityY(vy);
    this.jump.cuttable = false;
    this.jump.lastGroundedAt = -Infinity;
    this.groundLockUntil = now + GROUND_LOCK_MS;
    this.wasGrounded = false;
  }

  stompBounce(now: number, held: boolean) {
    this.launch(now, undefined, -(held ? COMBAT.stompBounceHeld : COMBAT.stompBounce));
  }

  // Bounce away from `sourceX` without damage (blocked attacks, armored boss).
  recoil(now: number, sourceX: number, speed = COMBAT.recoilSpeed, lift = COMBAT.recoilLift) {
    const direction = this.x < sourceX ? -1 : 1;
    this.rolling = false;
    this.dash.until = -Infinity;
    resetRun(this.run);
    this.controlLockUntil = now + RECOIL_LOCK_MS;
    this.launch(now, direction * speed, -lift);
  }

  knockback(now: number, sourceX: number) {
    const direction = this.x < sourceX ? -1 : 1;
    this.rolling = false;
    this.boostUntil = 0;
    this.dash.until = -Infinity;
    this.hurtUntil = this.controlLockUntil = now + COMBAT.knockbackMs;
    resetRun(this.run);
    this.launch(now, direction * COMBAT.knockbackSpeed, -COMBAT.knockbackLift);
  }

  die() {
    this.dead = true;
    this.rolling = false;
    this.held = false;
    this.body.setAllowGravity(true);
    this.body.setVelocity(0, 0);
  }

  respawn(x: number, y: number, now: number) {
    this.dead = false; this.held = false; this.rolling = false;
    this.body.setAllowGravity(true);
    this.body.reset(x, y);
    resetRun(this.run);
    this.jump.lastGroundedAt = this.jump.jumpPressedAt = -Infinity;
    this.jump.cuttable = false;
    this.boostUntil = this.hurtUntil = this.controlLockUntil = this.groundLockUntil = 0;
    this.dash.until = this.dash.readyAt = -Infinity;
    this.invulnerableUntil = now + COMBAT.invulnerableMs;
    this.wasGrounded = false; this.lastVy = 0; this.platformContactAt = -Infinity;
  }

  stop() {
    resetRun(this.run);
    this.rolling = false;
    this.dash.until = -Infinity;
    this.body.setVelocity(0, 0);
  }
}

