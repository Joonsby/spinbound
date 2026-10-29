import Phaser from 'phaser';
import { artScale, bake, ellipse, linear, radial, star } from './graphics/art';
import { ROBOT_PARTS } from './graphics/asset-manifest';
import { DEPTH } from './graphics/depth';
import { addLabel } from './graphics/display';
import { VFX } from './graphics/palette';
import { quality } from './graphics/quality';

const RINGS = 5;
const POPUPS = 5;
const CONFETTI = [0xff8a1f, 0x5cf2ff, 0xffd24a, 0x7ed957, 0xff8fb1];

export type GhostSource = { key: string; x: number; y: number; rotation: number; scale: number; flipX: boolean };
type Particle = {
  image: Phaser.GameObjects.Image; vx: number; vy: number; age: number; life: number;
  size: number; grow: number; gravity: number; drag: number; spin: number; fade: number;
};
type Spawn = Partial<Omit<Particle, 'image' | 'age'>> & { texture?: string; tint?: number; angle?: number };

// TEMPORARY ART: code-painted effect sprites (see docs/ASSET_MANIFEST.md, vfx/*).
function createEffectArt(scene: Phaser.Scene) {
  bake(scene, 'fx-spark', 12, 12, (ctx) => {
    star(ctx, 6, 6, 6, 1.6, 4, 0);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
  });
  bake(scene, 'fx-chunk', 10, 10, (ctx) => {
    ctx.beginPath();
    ctx.moveTo(1.5, 3); ctx.lineTo(6, 1); ctx.lineTo(9, 5); ctx.lineTo(6.5, 9); ctx.lineTo(2, 8);
    ctx.closePath();
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(43,34,54,0.55)';
    ctx.stroke();
  });
  bake(scene, 'fx-ring', 64, 64, (ctx) => {
    ctx.beginPath();
    ctx.arc(32, 32, 27, 0, Math.PI * 2);
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();
    ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.stroke();
  });
  bake(scene, 'fx-puff', 24, 24, (ctx) => {
    ellipse(ctx, 12, 12, 10, 10);
    ctx.fillStyle = radial(ctx, 12, 12, 11, [[0, '#FFFFFF'], [0.7, '#FFFFFF'], [1, 'rgba(255,255,255,0)']], 9, 9, 0);
    ctx.fill();
    ellipse(ctx, 15, 15, 6, 5);
    ctx.fillStyle = 'rgba(180,170,190,0.35)';
    ctx.fill();
  });
  bake(scene, 'fx-streak', 40, 6, (ctx) => {
    ctx.beginPath();
    ctx.moveTo(0, 3); ctx.quadraticCurveTo(20, 0, 40, 2.4); ctx.lineTo(40, 3.6); ctx.quadraticCurveTo(20, 6, 0, 3);
    ctx.fillStyle = linear(ctx, 0, 0, 40, 0, [[0, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,0.95)']]);
    ctx.fill();
  });
  bake(scene, 'fx-flash', 48, 48, (ctx) => {
    star(ctx, 24, 24, 23, 7, 8, 0);
    ctx.fillStyle = radial(ctx, 24, 24, 23, [[0, '#FFFFFF'], [0.55, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]);
    ctx.fill();
  });
  bake(scene, 'fx-confetti', 6, 10, (ctx) => {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 6, 10);
  });
}

// Pooled, quality-capped VFX. Nothing is allocated per frame; spawns silently drop when the pool is full.
export class GameEffects {
  private particles: Particle[];
  private ghosts: { image: Phaser.GameObjects.Image; age: number }[];
  private rings: { image: Phaser.GameObjects.Image; age: number; life: number; scale: number; alpha: number }[];
  private popups: { text: Phaser.GameObjects.Text; age: number }[];
  private throttle = new Map<string, number>();

  constructor(scene: Phaser.Scene) {
    createEffectArt(scene);
    const preset = quality();
    this.particles = Array.from({ length: preset.particles }, () => ({
      image: scene.add.image(0, 0, 'fx-spark').setDepth(DEPTH.effects).setVisible(false),
      vx: 0, vy: 0, age: 0, life: 0, size: 1, grow: 0, gravity: 0, drag: 0, spin: 0, fade: 1,
    }));
    this.ghosts = Array.from({ length: preset.ghosts }, () => ({ image: scene.add.image(0, 0, ROBOT_PARTS.ball.key).setDepth(DEPTH.player - 0.5).setVisible(false), age: 0 }));
    this.rings = Array.from({ length: RINGS }, () => ({ image: scene.add.image(0, 0, 'fx-ring').setDepth(DEPTH.effects).setVisible(false), age: 0, life: 0, scale: 1, alpha: 1 }));
    this.popups = Array.from({ length: POPUPS }, () => ({
      text: addLabel(scene, 0, 0, '', { fontSize: '15px', fontStyle: 'bold', color: '#FFF4C2', stroke: '#2B2236', strokeThickness: 4 }).setOrigin(0.5).setDepth(DEPTH.label).setVisible(false),
      age: 0,
    }));
  }

  private ready(key: string, time: number, gap: number) {
    if (time < (this.throttle.get(key) ?? 0)) return false;
    this.throttle.set(key, time + gap);
    return true;
  }

  private spawn(x: number, y: number, options: Spawn) {
    const particle = this.particles.find((entry) => !entry.image.visible);
    if (!particle) return;
    const texture = options.texture ?? 'fx-spark';
    particle.vx = options.vx ?? 0;
    particle.vy = options.vy ?? 0;
    particle.age = 0;
    particle.life = options.life ?? 0.35;
    particle.size = (options.size ?? 1) / artScale(texture);
    particle.grow = options.grow ?? 0;
    particle.gravity = options.gravity ?? 0;
    particle.drag = options.drag ?? 0;
    particle.spin = options.spin ?? 0;
    particle.fade = options.fade ?? 1;
    particle.image.setTexture(texture).setPosition(x, y).setTint(options.tint ?? 0xffffff).setAlpha(particle.fade)
      .setAngle(options.angle ?? 0).setScale(particle.size).setVisible(true);
  }

  // Generic radial sparks.
  burst(x: number, y: number, color: number, count: number, speed = 100) {
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2;
      const pace = speed * (0.7 + (i % 3) * 0.15);
      this.spawn(x, y, { vx: Math.cos(angle) * pace, vy: Math.sin(angle) * pace - 40, gravity: 180, life: 0.3 + (i % 3) * 0.07, size: 0.7 + (i % 3) * 0.25, tint: color, spin: 240 });
    }
  }

  debris(x: number, y: number, color: number, count: number) {
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI * (0.1 + 0.8 * i / Math.max(1, count - 1));
      const pace = 160 + (i % 4) * 45;
      this.spawn(x, y, { texture: 'fx-chunk', vx: Math.cos(angle) * pace, vy: Math.sin(angle) * pace, gravity: 760, life: 0.6, size: 1 + (i % 3) * 0.35, tint: color, spin: (i % 2 ? 1 : -1) * 420 });
    }
  }

  ring(x: number, y: number, color: number, scale = 1, alpha = 0.9) {
    const ring = this.rings.find((entry) => !entry.image.visible) ?? this.rings[0];
    ring.age = 0; ring.life = 0.28; ring.scale = scale / artScale('fx-ring'); ring.alpha = alpha;
    ring.image.setPosition(x, y).setTint(color).setAlpha(alpha).setScale(0.3 * ring.scale).setVisible(true);
  }

  private flash(x: number, y: number, color: number, size: number) {
    this.spawn(x, y, { texture: 'fx-flash', life: 0.16, size, grow: 2.2, tint: color, angle: Math.random() * 45 });
  }

  // Enemy hit: white star flash, shock ring and sparks.
  impact(x: number, y: number, color: number) {
    this.flash(x, y, VFX.hit, 0.9);
    this.ring(x, y, color, 0.8);
    this.burst(x, y, color, 8, 170);
  }

  // Boss weak point: larger, layered hit.
  bigImpact(x: number, y: number) {
    this.flash(x, y, VFX.hitCore, 1.6);
    this.ring(x, y, VFX.hitCore, 1.4);
    this.ring(x, y, 0xffffff, 0.9);
    this.burst(x, y, VFX.hitCore, 12, 230);
  }

  dust(x: number, y: number, direction: number, time: number) {
    if (!this.ready('dust', time, 85)) return;
    this.spawn(x - direction * 10, y, { texture: 'fx-puff', vx: -direction * 40, vy: -18, life: 0.38, size: 0.55, grow: 1.4, drag: 2.2, tint: VFX.dust, fade: 0.8 });
  }

  jump(x: number, y: number) {
    this.ring(x, y, VFX.jump, 0.55, 0.7);
    for (const side of [-1, 1]) this.spawn(x + side * 8, y, { texture: 'fx-puff', vx: side * 55, vy: -10, life: 0.3, size: 0.45, grow: 1.2, drag: 3, tint: VFX.dust, fade: 0.75 });
  }

  land(x: number, y: number, strength: number) {
    const count = strength > 0.8 ? 3 : 2;
    for (const side of [-1, 1]) {
      for (let i = 0; i < count; i++) {
        this.spawn(x + side * (6 + i * 6), y, { texture: 'fx-puff', vx: side * (60 + i * 35) * strength, vy: -12 - i * 6, life: 0.36, size: 0.5 + i * 0.12, grow: 1.1, drag: 3.2, tint: VFX.dust, fade: 0.8 });
      }
    }
  }

  rollSparks(x: number, y: number, direction: number, time: number) {
    if (!this.ready('roll', time, 60)) return;
    for (let i = 0; i < 2; i++) {
      this.spawn(x - direction * 14, y - 2 - i * 4, { vx: -direction * (90 + i * 40), vy: -60 - i * 50, gravity: 520, life: 0.28, size: 0.6 + i * 0.2, tint: i ? VFX.rollSparkCore : VFX.rollSpark, spin: 360 });
    }
  }

  skid(x: number, y: number, direction: number, time: number) {
    if (!this.ready('skid', time, 70)) return;
    this.spawn(x + direction * 10, y - 2, { vx: direction * 70, vy: -70, gravity: 500, life: 0.24, size: 0.55, tint: VFX.rollSparkCore });
    this.spawn(x + direction * 6, y, { texture: 'fx-puff', vx: direction * 30, vy: -12, life: 0.3, size: 0.4, grow: 1, drag: 3, tint: VFX.dust, fade: 0.7 });
  }

  boostStreaks(x: number, y: number, direction: number, time: number) {
    if (!this.ready('boost', time, 55)) return;
    const offset = (Math.floor(time / 55) % 3) - 1;
    this.spawn(x - direction * 26, y - 8 + offset * 9, { texture: 'fx-streak', vx: -direction * 160, life: 0.22, size: 0.8, tint: VFX.boostLight, angle: direction > 0 ? 180 : 0, fade: 0.85 });
  }

  boostEntry(x: number, y: number) {
    this.ring(x, y, VFX.boost, 1.2);
    this.burst(x, y, VFX.boostLight, 6, 120);
  }

  spring(x: number, y: number) {
    this.ring(x, y, VFX.spring, 0.9, 0.8);
    for (let i = 0; i < 6; i++) this.spawn(x + (i - 2.5) * 6, y, { vx: (i - 2.5) * 22, vy: -260 - (i % 3) * 60, gravity: 700, life: 0.4, size: 0.7, tint: i % 2 ? 0xfff0c8 : VFX.spring });
  }

  coin(x: number, y: number) {
    this.ring(x, y, VFX.coin, 0.45, 0.8);
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2 + Math.PI / 4;
      this.spawn(x, y, { vx: Math.cos(angle) * 70, vy: Math.sin(angle) * 70, drag: 4, life: 0.32, size: 0.9, tint: VFX.coin, spin: 180 });
    }
  }

  reward(x: number, y: number) {
    this.flash(x, y, VFX.coin, 1.2);
    this.ring(x, y, VFX.coin, 1.2);
    this.burst(x, y, VFX.coin, 12, 160);
  }

  checkpoint(x: number, y: number) {
    this.ring(x, y, VFX.crystal, 1.1);
    for (let i = 0; i < 8; i++) this.spawn(x + (i - 3.5) * 5, y + 10, { vx: (i - 3.5) * 8, vy: -120 - (i % 3) * 30, drag: 1.5, life: 0.6, size: 0.7, tint: i % 2 ? 0xffffff : VFX.crystal, spin: 200 });
  }

  wallBreak(x: number, y: number) {
    this.ring(x, y, 0xffe1a8, 1.4);
    this.debris(x, y, VFX.stone, 12);
    for (let i = 0; i < 5; i++) this.spawn(x + (i - 2) * 8, y + 20, { texture: 'fx-puff', vx: (i - 2) * 40, vy: -30, life: 0.5, size: 0.8, grow: 1.4, drag: 2, tint: VFX.dust, fade: 0.8 });
  }

  confetti(x: number, y: number) {
    for (let i = 0; i < 16; i++) {
      const angle = -Math.PI * (0.15 + 0.7 * i / 15);
      const pace = 260 + (i % 4) * 60;
      this.spawn(x, y, { texture: 'fx-confetti', vx: Math.cos(angle) * pace, vy: Math.sin(angle) * pace, gravity: 420, drag: 0.8, life: 1.1, size: 0.9, tint: CONFETTI[i % CONFETTI.length], spin: (i % 2 ? 1 : -1) * 540 });
    }
  }

  popup(x: number, y: number, text: string) {
    const popup = this.popups.find((entry) => !entry.text.visible) ?? this.popups[0];
    popup.age = 0;
    popup.text.setText(text).setPosition(x, y).setAlpha(1).setScale(0.6).setVisible(true);
  }

  trail(source: GhostSource, time: number) {
    if (!this.ready('trail', time, 70)) return;
    const ghost = this.ghosts.find((entry) => !entry.image.visible);
    if (!ghost) return;
    ghost.age = 0;
    ghost.image.setTexture(source.key).setPosition(source.x, source.y).setRotation(source.rotation).setScale(source.scale)
      .setFlipX(source.flipX).setTint(0xffc98a).setAlpha(0.35).setVisible(true);
  }

  update(delta: number) {
    const dt = Math.min(delta, 50) / 1000;
    for (const particle of this.particles) {
      if (!particle.image.visible) continue;
      particle.age += dt;
      if (particle.age >= particle.life) { particle.image.setVisible(false); continue; }
      const damping = Math.max(0, 1 - particle.drag * dt);
      particle.vx *= damping;
      particle.vy = particle.vy * damping + particle.gravity * dt;
      const image = particle.image;
      image.x += particle.vx * dt;
      image.y += particle.vy * dt;
      image.angle += particle.spin * dt;
      const progress = particle.age / particle.life;
      image.setAlpha(particle.fade * (1 - progress * progress)).setScale(particle.size * (particle.grow ? 1 + particle.grow * progress : 1 - progress * 0.5));
    }
    for (const ghost of this.ghosts) {
      if (!ghost.image.visible) continue;
      ghost.age += dt;
      if (ghost.age >= 0.24) ghost.image.setVisible(false);
      else ghost.image.setAlpha(0.35 * (1 - ghost.age / 0.24));
    }
    for (const ring of this.rings) {
      if (!ring.image.visible) continue;
      ring.age += dt;
      if (ring.age >= ring.life) { ring.image.setVisible(false); continue; }
      const progress = ring.age / ring.life;
      ring.image.setScale(ring.scale * (0.3 + progress * 1.3)).setAlpha(ring.alpha * (1 - progress));
    }
    for (const popup of this.popups) {
      if (!popup.text.visible) continue;
      popup.age += dt;
      if (popup.age >= 0.7) { popup.text.setVisible(false); continue; }
      const progress = popup.age / 0.7;
      popup.text.y -= 50 * dt;
      popup.text.setScale(Math.min(1, 0.6 + progress * 3)).setAlpha(progress < 0.6 ? 1 : 1 - (progress - 0.6) / 0.4);
    }
  }

  clear() {
    this.particles.forEach((particle) => particle.image.setVisible(false));
    this.ghosts.forEach((ghost) => ghost.image.setVisible(false));
    this.rings.forEach((ring) => ring.image.setVisible(false));
    this.popups.forEach((popup) => popup.text.setVisible(false));
  }

  destroy() {
    this.particles.forEach((particle) => particle.image.destroy());
    this.ghosts.forEach((ghost) => ghost.image.destroy());
    this.rings.forEach((ring) => ring.image.destroy());
    this.popups.forEach((popup) => popup.text.destroy());
  }
}
