import Phaser from 'phaser';

const PARTICLES = 64;
const GHOSTS = 6;
const RINGS = 4;

type Particle = { image: Phaser.GameObjects.Image; vx: number; vy: number; age: number; life: number; size: number; gravity: number };

// Pooled sparks, debris, afterimages and shock rings. Nothing is allocated per frame.
export class GameEffects {
  private particles: Particle[];
  private ghosts: { image: Phaser.GameObjects.Image; age: number }[];
  private rings: { image: Phaser.GameObjects.Image; age: number; life: number; scale: number }[];
  private nextTrail = 0;
  private nextDust = 0;

  constructor(scene: Phaser.Scene) {
    if (!scene.textures.exists('fx-spark')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xffffff); g.fillTriangle(4, 0, 2, 4, 6, 4); g.fillTriangle(4, 8, 2, 4, 6, 4); g.fillTriangle(0, 4, 4, 2, 4, 6); g.fillTriangle(8, 4, 4, 2, 4, 6);
      g.generateTexture('fx-spark', 8, 8);
      g.clear(); g.fillStyle(0xffffff); g.fillRoundedRect(0, 0, 8, 8, 2);
      g.generateTexture('fx-chunk', 8, 8);
      g.clear(); g.lineStyle(5, 0xffffff); g.strokeCircle(32, 32, 28);
      g.generateTexture('fx-ring', 64, 64);
      g.destroy();
    }
    this.particles = Array.from({ length: PARTICLES }, () => ({ image: scene.add.image(0, 0, 'fx-spark').setDepth(6).setVisible(false), vx: 0, vy: 0, age: 0, life: 0, size: 1, gravity: 180 }));
    this.ghosts = Array.from({ length: GHOSTS }, () => ({ image: scene.add.image(0, 0, 'robot-idle-0').setDepth(3).setVisible(false), age: 0 }));
    this.rings = Array.from({ length: RINGS }, () => ({ image: scene.add.image(0, 0, 'fx-ring').setDepth(6).setVisible(false), age: 0, life: 0, scale: 1 }));
  }

  private emit(x: number, y: number, color: number, count: number, speed: number, texture: string, gravity: number, size: number, life: number, spread = Math.PI * 2, angleOffset = 0) {
    let emitted = 0;
    for (const particle of this.particles) {
      if (particle.image.visible) continue;
      const angle = angleOffset + (count > 1 ? emitted / (count - (spread < Math.PI * 2 ? 1 : 0)) : 0.5) * spread;
      particle.vx = Math.cos(angle) * speed * (0.7 + emitted % 3 * 0.15);
      particle.vy = Math.sin(angle) * speed * (0.7 + emitted % 2 * 0.3) - 45;
      particle.age = 0; particle.life = life + emitted % 3 * 0.07; particle.size = size * (0.6 + emitted % 3 * 0.3); particle.gravity = gravity;
      particle.image.setTexture(texture).setPosition(x, y).setTint(color).setAlpha(1).setAngle(emitted * 37).setScale(particle.size).setVisible(true);
      if (++emitted >= Math.min(count, 16)) break;
    }
  }

  burst(x: number, y: number, color: number, count: number, speed = 100) {
    this.emit(x, y, color, count, speed, 'fx-spark', 180, 1, 0.3);
  }

  // Heavy chunks for breakable walls and the boss.
  debris(x: number, y: number, color: number, count: number) {
    this.emit(x, y, color, count, 230, 'fx-chunk', 720, 1.5, 0.55, Math.PI * 1.2, -Math.PI * 1.1);
  }

  ring(x: number, y: number, color: number, scale = 1) {
    const ring = this.rings.find((entry) => !entry.image.visible) ?? this.rings[0];
    ring.age = 0; ring.life = 0.26; ring.scale = scale;
    ring.image.setPosition(x, y).setTint(color).setAlpha(0.9).setScale(0.3 * scale).setVisible(true);
  }

  impact(x: number, y: number, color: number) {
    this.ring(x, y, color, 0.8);
    this.burst(x, y, color, 10, 170);
  }

  // Ground dust behind a fast runner; throttled so it never floods the pool.
  dust(x: number, y: number, direction: number, time: number) {
    if (time < this.nextDust) return;
    this.nextDust = time + 60;
    this.emit(x - direction * 12, y, 0xe8dcc0, 2, 60, 'fx-chunk', 120, 0.55, 0.28, Math.PI * 0.5, direction > 0 ? Math.PI * 1.05 : -Math.PI * 0.55);
  }

  trail(player: Phaser.GameObjects.Sprite, time: number) {
    if (time < this.nextTrail) return;
    this.nextTrail = time + 75;
    const ghost = this.ghosts.find((entry) => !entry.image.visible);
    if (!ghost) return;
    ghost.age = 0;
    ghost.image.setTexture(player.texture.key, player.frame.name).setPosition(player.x, player.y).setScale(player.scaleX, player.scaleY).setFlipX(player.flipX).setAngle(player.angle).setTint(0x9bffe6).setAlpha(0.3).setVisible(true);
  }

  update(delta: number) {
    const dt = Math.min(delta, 50) / 1000;
    for (const particle of this.particles) {
      if (!particle.image.visible) continue;
      particle.age += dt;
      if (particle.age >= particle.life) { particle.image.setVisible(false); continue; }
      particle.vy += particle.gravity * dt;
      particle.image.x += particle.vx * dt; particle.image.y += particle.vy * dt;
      const remaining = 1 - particle.age / particle.life;
      particle.image.setAlpha(remaining).setScale(particle.size * (0.4 + remaining * 0.6));
    }
    for (const ghost of this.ghosts) {
      if (!ghost.image.visible) continue;
      ghost.age += dt;
      if (ghost.age >= 0.24) ghost.image.setVisible(false);
      else ghost.image.setAlpha(0.3 * (1 - ghost.age / 0.24));
    }
    for (const ring of this.rings) {
      if (!ring.image.visible) continue;
      ring.age += dt;
      if (ring.age >= ring.life) { ring.image.setVisible(false); continue; }
      const progress = ring.age / ring.life;
      ring.image.setScale(ring.scale * (0.3 + progress * 1.3)).setAlpha(0.9 * (1 - progress));
    }
  }

  clear() {
    this.particles.forEach((particle) => particle.image.setVisible(false));
    this.ghosts.forEach((ghost) => ghost.image.setVisible(false));
    this.rings.forEach((ring) => ring.image.setVisible(false));
  }

  destroy() {
    this.particles.forEach((particle) => particle.image.destroy());
    this.ghosts.forEach((ghost) => ghost.image.destroy());
    this.rings.forEach((ring) => ring.image.destroy());
  }
}
