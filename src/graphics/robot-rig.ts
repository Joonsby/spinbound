import Phaser from 'phaser';
import { artScale } from './art';
import { eyesPart, ROBOT_PARTS, ROBOT_RIG, type PartSpec, type RobotExpression } from './asset-manifest';
import { DEPTH } from './depth';

// Parts-based robot. Part shapes never change between frames: only position, rotation, scale
// and the eye texture do, so swapping in delivered PNG parts keeps every animation intact.

export type RigState = {
  now: number;
  deltaMs: number;
  x: number;
  bottom: number;
  centerY: number;
  // Floor height under the robot for the contact shadow, or undefined over a pit.
  groundY: number | undefined;
  vx: number;
  vy: number;
  grounded: boolean;
  rolling: boolean;
  held: boolean;
  hurt: boolean;
  dead: boolean;
  skidding: boolean;
  flicker: boolean;
  facing: number;
  ropeTilt: number;
};

export type RigEvent = 'jump' | 'land' | 'spring' | 'grab' | 'release' | 'hurt' | 'happy';

const STRIDE = 44;
const SPRING_STIFFNESS = 260;
const SPRING_DAMPING = 16;
const MORPH_IN_S = 0.12;
const MORPH_OUT_S = 0.14;
const DEATH_MS = 450;

const lerp = Phaser.Math.Linear;
const clamp = Phaser.Math.Clamp;
const approach = (current: number, target: number, rate: number, dt: number) => current + (target - current) * (1 - Math.exp(-rate * dt));
const smoothstep = (from: number, to: number, value: number) => {
  const t = clamp((value - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeOutBack = (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;

type Part = { image: Phaser.GameObjects.Image; base: number; home: { x: number; y: number } };

export class RobotRig {
  readonly root: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Container;
  private headGroup: Phaser.GameObjects.Container;
  private shadow: Phaser.GameObjects.Image;
  private parts: Part[] = [];
  private head: Part;
  private eyes: Part;
  private finNear: Part;
  private finFar: Part;
  private torso: Part;
  private armFront: Part;
  private armBack: Part;
  private legFront: Part;
  private legBack: Part;
  private wheelFront: Part;
  private wheelBack: Part;
  private ball: Part;
  private ballShade: Part;
  private morph = 0;
  private phase = 0;
  private wheelSpin = 0;
  private ballSpin = 0;
  private stretch = 0;
  private stretchVelocity = 0;
  private arms = { front: 8, back: -8 };
  private lean = 0;
  private finLag = 0;
  private lastX = Number.NaN;
  private now = 0;
  private expression: RobotExpression = 'normal';
  private emote: RobotExpression | undefined;
  private emoteUntil = 0;
  private blinkAt = 2500;
  private flashUntil = 0;
  private flashing = false;
  private deadAt = -1;

  constructor(private scene: Phaser.Scene, x: number, y: number) {
    const rig = ROBOT_RIG;
    this.shadow = scene.add.image(x, y, ROBOT_PARTS.shadow.key).setDepth(DEPTH.shadow);
    this.shadow.setScale(1 / artScale(ROBOT_PARTS.shadow.key));
    this.root = scene.add.container(x, y).setDepth(DEPTH.player);
    this.body = scene.add.container(0, 0);
    this.headGroup = scene.add.container(rig.neck.x, rig.neck.y);
    this.root.add(this.body);
    this.legBack = this.part(ROBOT_PARTS.leg, rig.hipBack, this.body, 1, 0xc9c4d6);
    this.wheelBack = this.part(ROBOT_PARTS.wheel, rig.wheelBack, this.body, 0.92, 0xc9c4d6);
    this.armBack = this.part(ROBOT_PARTS.arm, rig.shoulderBack, this.body, 1, 0xc9c4d6);
    this.torso = this.part(ROBOT_PARTS.torso, rig.torso, this.body);
    this.legFront = this.part(ROBOT_PARTS.leg, rig.hipFront, this.body);
    this.wheelFront = this.part(ROBOT_PARTS.wheel, rig.wheelFront, this.body);
    this.body.add(this.headGroup);
    this.finFar = this.part(ROBOT_PARTS.fin, rig.finFar, this.headGroup, rig.finFar.scale, 0xd8cfd8);
    this.head = this.part(ROBOT_PARTS.head, { x: 0, y: 0 }, this.headGroup);
    this.part(ROBOT_PARTS.crest, rig.crest, this.headGroup);
    this.eyes = this.part(eyesPart('normal'), rig.eyes, this.headGroup);
    this.finNear = this.part(ROBOT_PARTS.fin, rig.finNear, this.headGroup);
    this.armFront = this.part(ROBOT_PARTS.arm, rig.shoulderFront, this.body);
    this.ball = this.part(ROBOT_PARTS.ball, rig.ball, this.body);
    this.ballShade = this.part(ROBOT_PARTS.ballShade, rig.ball, this.body);
    this.headGroup.setData('home', { ...rig.neck });
  }

  private part(spec: PartSpec, home: { x: number; y: number }, parent: Phaser.GameObjects.Container, scale = 1, tint?: number): Part {
    const image = this.scene.add.image(home.x, home.y, spec.key).setOrigin(spec.pivotX / spec.width, spec.pivotY / spec.height);
    const base = scale / artScale(spec.key);
    image.setScale(base);
    if (tint !== undefined) image.setTint(tint);
    image.setData('tint', tint);
    parent.add(image);
    const part = { image, base, home };
    this.parts.push(part);
    return part;
  }

  event(name: RigEvent, strength = 1) {
    if (name === 'jump') this.stretchVelocity += 3 * strength;
    else if (name === 'land') { this.stretch = -0.2 * strength; this.stretchVelocity = 0; }
    else if (name === 'spring') { this.stretchVelocity += 5.5; this.showEmote('happy', 450); }
    else if (name === 'grab') { this.stretch = 0.1; this.stretchVelocity = 0; }
    else if (name === 'release') this.stretchVelocity += 3.5;
    else if (name === 'hurt') this.flashUntil = this.now + 90;
    else this.showEmote('happy', 420);
  }

  private showEmote(expression: RobotExpression, ms: number) {
    this.emote = expression;
    this.emoteUntil = this.now + ms;
  }

  reset() {
    this.morph = 0; this.stretch = 0; this.stretchVelocity = 0; this.lean = 0; this.finLag = 0;
    this.deadAt = -1; this.flashUntil = 0; this.emote = undefined; this.lastX = Number.NaN;
    this.body.setAngle(0).setPosition(0, 0);
    this.root.setAngle(0);
  }

  // Afterimage source while rolling: the spinning shell at its on-screen transform.
  ghost() {
    const facing = this.root.scaleX < 0 ? -1 : 1;
    return {
      key: ROBOT_PARTS.ball.key,
      x: this.root.x + ROBOT_RIG.ball.x * facing,
      y: this.root.y + ROBOT_RIG.ball.y * this.body.scaleY,
      rotation: this.ball.image.rotation * facing,
      scale: this.ball.image.scaleY,
      flipX: facing < 0,
    };
  }

  update(state: RigState) {
    const dt = Math.min(Math.max(state.deltaMs, 0), 50) / 1000;
    this.now = state.now;
    const dx = Number.isNaN(this.lastX) ? 0 : state.x - this.lastX;
    this.lastX = state.x;
    const facing = state.facing < 0 ? -1 : 1;
    const speed = Math.abs(state.vx);
    const t = state.now / 1000;
    const rig = ROBOT_RIG;

    // Robot ↔ ball morph and spin. Rolling distance drives the shell angle (no slipping).
    this.morph = state.rolling && !state.dead ? Math.min(1, this.morph + dt / MORPH_IN_S) : Math.max(0, this.morph - dt / MORPH_OUT_S);
    if (state.grounded || this.morph > 0.5) this.ballSpin = dx * facing / rig.ballRadius;
    this.ball.image.rotation += this.ballSpin;
    this.wheelSpin = state.grounded ? dx * facing / rig.wheelRadius : this.wheelSpin * 0.94;
    if (state.grounded && !state.rolling) this.phase += Math.abs(dx) / STRIDE * Math.PI * 2;

    // Volume-preserving squash and stretch from a damped spring.
    this.stretchVelocity += (-SPRING_STIFFNESS * this.stretch - SPRING_DAMPING * this.stretchVelocity) * dt;
    this.stretch = clamp(this.stretch + this.stretchVelocity * dt, -0.3, 0.35);

    // Pose targets (arm angles: 0 = hanging, positive = swung forward).
    let armFront = 8 + Math.sin(t * 3.9) * 3;
    let armBack = -6 - Math.sin(t * 3.9) * 3;
    let lean = 0;
    let bob = Math.sin(t * 3.9) * 0.7;
    let liftFront = 0;
    let liftBack = 0;
    if (state.dead) {
      armFront = 120; armBack = 150;
    } else if (state.held) {
      armFront = 172; armBack = 186; bob = 0;
    } else if (state.hurt) {
      armFront = -50; armBack = -72; lean = -14; bob = 0;
    } else if (!state.grounded) {
      const rise = clamp(-state.vy / 570, -1, 1);
      if (rise > 0) { armFront = 135 + rise * 25; armBack = 155 + rise * 20; lean = -4 * rise; liftFront = liftBack = -2.5; }
      else { armFront = 100 - rise * 25; armBack = 118 - rise * 25; lean = -6 * rise; liftFront = liftBack = 1.5; }
      bob = 0;
    } else if (state.skidding) {
      armFront = -35; armBack = -55; lean = -11; bob = 0;
    } else if (speed > 12) {
      const pace = clamp(speed / 270, 0, 1.3);
      const swing = Math.sin(this.phase);
      armFront = 10 + swing * 42 * Math.min(1, pace);
      armBack = 10 - swing * 42 * Math.min(1, pace);
      lean = 7 * Math.min(1.2, pace);
      bob = -Math.abs(swing) * 1.8 * Math.min(1, pace);
      liftFront = -Math.max(0, swing) * 1.6;
      liftBack = -Math.max(0, -swing) * 1.6;
    }
    this.arms.front = approach(this.arms.front, armFront, 18, dt);
    this.arms.back = approach(this.arms.back, armBack, 18, dt);
    this.lean = approach(this.lean, lean, 14, dt);
    this.finLag = approach(this.finLag, clamp(state.vy * 0.03, -20, 24) + this.lean * 0.9 + Math.sin(this.phase * 2) * 2, 10, dt);

    // Death: hop and topple onto the back.
    let deathAngle = 0;
    let hop = 0;
    if (state.dead) {
      if (this.deadAt < 0) this.deadAt = state.now;
      const p = clamp((state.now - this.deadAt) / DEATH_MS, 0, 1);
      deathAngle = -80 * (1 - (1 - p) ** 2);
      hop = -Math.sin(p * Math.PI) * 12;
    } else this.deadAt = -1;

    // Root: feet anchor, facing flip, rope tilt around the body centre.
    if (state.held) {
      const angle = state.ropeTilt * Math.PI / 180;
      const half = state.bottom - state.centerY;
      this.root.setPosition(state.x - Math.sin(angle) * half, state.centerY + Math.cos(angle) * half).setAngle(state.ropeTilt);
    } else this.root.setPosition(state.x, state.bottom).setAngle(0);
    this.root.setScale(facing, 1).setAlpha(state.flicker ? 0.35 : 1);
    this.body.setPosition(0, hop).setAngle(this.lean + deathAngle).setScale(1 - this.stretch * 0.8, 1 + this.stretch);

    // Apply the morph: robot parts fold into the ball centre while the shell grows in.
    const m = this.morph;
    const robotAlpha = 1 - smoothstep(0.45, 0.9, m);
    const shrink = lerp(1, 0.35, m);
    const fold = (part: Part, x: number, y: number, angle: number) => {
      part.image.setPosition(lerp(x, rig.ball.x, m * 0.85), lerp(y, rig.ball.y, m * 0.85))
        .setAngle(angle).setScale(part.base * shrink).setAlpha(robotAlpha).setVisible(robotAlpha > 0.01);
    };
    fold(this.torso, rig.torso.x, rig.torso.y + bob, 0);
    fold(this.armFront, rig.shoulderFront.x, rig.shoulderFront.y + bob, -this.arms.front);
    fold(this.armBack, rig.shoulderBack.x, rig.shoulderBack.y + bob, -this.arms.back);
    for (const [leg, wheel, hip, home, lift] of [
      [this.legFront, this.wheelFront, rig.hipFront, rig.wheelFront, liftFront],
      [this.legBack, this.wheelBack, rig.hipBack, rig.wheelBack, liftBack],
    ] as const) {
      const wheelY = home.y + lift;
      fold(wheel, home.x, wheelY, wheel.image.angle + this.wheelSpin * 180 / Math.PI);
      fold(leg, hip.x, hip.y + bob * 0.5, Math.atan2(-(home.x - hip.x), wheelY - hip.y - bob * 0.5) * 180 / Math.PI);
    }
    const headX = lerp(rig.neck.x, rig.ball.x, m * 0.85);
    const headY = lerp(rig.neck.y + bob * 1.2, rig.ball.y + 10, m * 0.85);
    this.headGroup.setPosition(headX, headY).setAngle(-this.lean * 0.35).setScale(shrink).setAlpha(robotAlpha).setVisible(robotAlpha > 0.01);
    this.finNear.image.setAngle(rig.finNear.angle + this.finLag);
    this.finFar.image.setAngle(rig.finFar.angle + this.finLag * 0.8);
    const shellAlpha = smoothstep(0.3, 0.75, m);
    const shellScale = 0.55 + 0.45 * easeOutBack(m);
    for (const shell of [this.ball, this.ballShade]) {
      shell.image.setScale(shell.base * shellScale).setAlpha(shellAlpha).setVisible(shellAlpha > 0.01);
    }

    this.updateFace(state);
    this.updateFlash(state.now);
    this.updateShadow(state);
  }

  private updateFace(state: RigState) {
    let expression: RobotExpression = 'normal';
    if (state.dead) expression = 'dead';
    else if (state.hurt) expression = 'hurt';
    else if (this.emote && state.now < this.emoteUntil) expression = this.emote;
    else if (state.skidding || (!state.grounded && state.vy > 520)) expression = 'surprised';
    else if (state.now >= this.blinkAt) {
      expression = 'blink';
      if (state.now >= this.blinkAt + 110) this.blinkAt = state.now + 2600 + Math.random() * 1600;
    }
    if (expression !== this.expression) {
      this.expression = expression;
      const spec = eyesPart(expression);
      this.eyes.image.setTexture(spec.key).setOrigin(spec.pivotX / spec.width, spec.pivotY / spec.height);
    }
  }

  private updateFlash(now: number) {
    const flashing = now < this.flashUntil;
    if (flashing === this.flashing) return;
    this.flashing = flashing;
    for (const { image } of this.parts) {
      if (flashing) image.setTintFill(0xffffff);
      else {
        const tint = image.getData('tint') as number | undefined;
        if (tint === undefined) image.clearTint(); else image.setTint(tint);
      }
    }
  }

  private updateShadow(state: RigState) {
    if (state.groundY === undefined || state.held || state.dead) { this.shadow.setVisible(false); return; }
    const height = Math.max(0, state.groundY - state.bottom);
    const near = clamp(1 - height / 170, 0.2, 1);
    const base = 1 / artScale(ROBOT_PARTS.shadow.key);
    this.shadow.setVisible(true).setPosition(state.x, state.groundY).setAlpha(near)
      .setScale(base * (0.55 + 0.45 * near) * (this.morph > 0.5 ? 1.1 : 1), base * (0.55 + 0.45 * near));
  }

  destroy() {
    this.shadow.destroy();
    this.root.destroy();
  }
}
