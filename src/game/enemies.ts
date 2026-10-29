import Phaser from 'phaser';
import { COMBAT, PHYSICS } from './config';
import { MonsterHealthBar } from '../health-bar';
import type { EnemyKind } from '../stages';
import type { VisualSync } from './visual-sync';

export type EnemyConfig = { kind: EnemyKind; x: number; y: number; min: number; max: number };

export type Enemy = {
  kind: EnemyKind;
  sprite: Phaser.GameObjects.Rectangle;
  body: Phaser.Physics.Arcade.Body;
  visual: Phaser.GameObjects.Sprite;
  healthBar?: MonsterHealthBar;
  min: number;
  max: number;
  baseY: number;
  hp: number;
  maxHp: number;
  state: 'idle' | 'windup' | 'charge' | 'recover';
  until: number;
  direction: number;
  knockedUntil: number;
  // Stage 1 enemies only hurt after being on screen briefly.
  contactReadyAt: number;
  nextHitAt: number;
};

export type DamageResult = 'defeated' | 'hit' | 'ignored';

// Spawning, patrol/fly/charger AI and defeat handling. Contact rules live in contact.ts.
export class EnemySystem {
  readonly group: Phaser.Physics.Arcade.Group;
  readonly list: Enemy[] = [];
  private byObject = new Map<Phaser.GameObjects.GameObject, Enemy>();

  constructor(private scene: Phaser.Scene, configs: EnemyConfig[], visuals: VisualSync, private onScreenGrace: boolean) {
    this.group = scene.physics.add.group({ allowGravity: false });
    for (const { kind, x, y, min, max } of configs) {
      const sprite = scene.add.rectangle(x, y, 34, 36, 0xd783ff);
      scene.physics.add.existing(sprite);
      this.group.add(sprite);
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false).setVelocityX(kind === 'charger' ? 0 : COMBAT.enemySpeed);
      const key = kind === 'fly' ? 'enemy-fly' : kind === 'charger' ? 'enemy-charge' : 'enemy';
      const visual = visuals.attach(sprite, `${key}-0`, kind === 'fly' ? 56 : 44, 42, -3, true).play(kind === 'patrol' ? 'enemy-walk' : key);
      const maxHp = COMBAT.enemyHp[kind];
      const enemy: Enemy = {
        kind, sprite, body, visual, min, max, baseY: y, hp: maxHp, maxHp, state: 'idle', until: 0, direction: 1, knockedUntil: 0,
        contactReadyAt: onScreenGrace ? Infinity : 0, nextHitAt: 0,
        healthBar: kind === 'charger' ? new MonsterHealthBar(scene) : undefined,
      };
      this.list.push(enemy);
      this.byObject.set(sprite, enemy);
    }
  }

  find(object: unknown) {
    return this.byObject.get(object as Phaser.GameObjects.GameObject);
  }

  update(now: number, view: Phaser.Geom.Rectangle, playerX: number, playerY: number, playerSpeed: number) {
    for (const enemy of this.list) {
      if (!enemy.sprite.active) continue;
      const { body, sprite, visual } = enemy;
      const visible = Phaser.Geom.Rectangle.Contains(view, body.center.x, body.center.y);
      if (this.onScreenGrace) {
        if (!visible) enemy.contactReadyAt = Infinity;
        else if (enemy.contactReadyAt === Infinity) enemy.contactReadyAt = now + 650;
      }
      if (now < enemy.knockedUntil) continue;
      if (enemy.knockedUntil) { enemy.knockedUntil = 0; body.setVelocityX(enemy.kind === 'charger' ? 0 : COMBAT.enemySpeed * enemy.direction); }
      // Use physics coordinates and reverse only when heading out of bounds.
      // Repeated Body.reset() at an endpoint used to cancel patrol integration.
      if (enemy.kind !== 'charger') {
        if (body.center.x <= enemy.min && body.velocity.x <= 0) {
          body.x = enemy.min - body.halfWidth;
          body.setVelocityX(COMBAT.enemySpeed);
        } else if (body.center.x >= enemy.max && body.velocity.x >= 0) {
          body.x = enemy.max - body.halfWidth;
          body.setVelocityX(-COMBAT.enemySpeed);
        }
        enemy.direction = Math.sign(body.velocity.x) || enemy.direction;
        if (enemy.kind === 'fly') {
          const targetY = enemy.baseY + Math.sin(now / 700 + enemy.min) * 24;
          body.setVelocityY((targetY - body.center.y) * 8);
        }
        continue;
      }
      const distance = playerX - body.center.x;
      if (enemy.state === 'idle') {
        body.setVelocityX(0);
        if (visible && now >= enemy.contactReadyAt
          && Math.abs(distance) < Math.min(300, view.width * 0.65)
          && Math.abs(playerY - body.center.y) < 60
          && playerSpeed < PHYSICS.runSpeed + 30) {
          enemy.direction = Math.sign(distance) || 1;
          enemy.state = 'windup';
          enemy.until = now + 800;
        }
      } else if (enemy.state === 'windup') {
        body.setVelocityX(0);
        if (now >= enemy.until) {
          enemy.state = 'charge';
          enemy.until = now + 650;
        }
      }
      if (enemy.state === 'charge') {
        const atEdge = (body.center.x <= enemy.min && enemy.direction < 0) || (body.center.x >= enemy.max && enemy.direction > 0);
        if (atEdge || now >= enemy.until) {
          enemy.state = 'recover';
          enemy.until = now + 1200;
          body.setVelocityX(0);
        } else body.setVelocityX(enemy.direction * COMBAT.chargeSpeed);
      } else if (enemy.state === 'recover' && now >= enemy.until) enemy.state = 'idle';
      if (enemy.state === 'windup') {
        visual.setTint(0xffa45c);
        sprite.setAlpha(Math.floor(now / 100) % 2 ? 0.55 : 1);
      } else if (enemy.state === 'recover') {
        visual.setTint(0xbfc9ff);
        sprite.setAlpha(1);
      } else { visual.clearTint(); sprite.setAlpha(1); }
    }
  }

  // A dazed charger is the opening to punish, so touching it is harmless.
  canHurt(enemy: Enemy, now: number) {
    return enemy.sprite.active && now >= enemy.contactReadyAt && !(enemy.kind === 'charger' && enemy.state === 'recover');
  }

  // A recovering charger is the timing window: any hit there is doubled.
  damage(enemy: Enemy, amount: number, fromX: number, now: number): DamageResult {
    if (!enemy.sprite.active || now < enemy.nextHitAt) return 'ignored';
    enemy.nextHitAt = now + COMBAT.enemyHitCooldownMs;
    enemy.hp = Math.max(0, enemy.hp - (enemy.kind === 'charger' && enemy.state === 'recover' ? amount * 2 : amount));
    if (enemy.hp === 0) { this.defeat(enemy, fromX); return 'defeated'; }
    const direction = enemy.body.center.x < fromX ? -1 : 1;
    // The attacker bounces off; a short grace keeps the rebound from turning into a hit.
    enemy.contactReadyAt = Math.max(enemy.contactReadyAt, now + 400);
    enemy.knockedUntil = now + 220;
    enemy.body.setVelocityX(direction * 200);
    if (enemy.kind === 'charger') { enemy.state = 'recover'; enemy.until = now + 1200; }
    return 'hit';
  }

  private defeat(enemy: Enemy, fromX: number) {
    const { sprite, body } = enemy;
    sprite.setActive(false);
    body.enable = false;
    body.setVelocity(0, 0);
    enemy.healthBar?.hide();
    enemy.visual.clearTint();
    this.scene.tweens.killTweensOf(sprite);
    sprite.setAlpha(1);
    const direction = fromX < sprite.x ? 1 : -1;
    this.scene.tweens.add({ targets: sprite, x: sprite.x + direction * 44, y: sprite.y - 45, angle: direction * 140, scaleX: 0.2, scaleY: 0.2, alpha: 0, duration: 380, ease: 'Quad.easeIn', onComplete: () => sprite.setVisible(false) });
  }

  syncHealthBars(view: Phaser.Geom.Rectangle) {
    for (const enemy of this.list) {
      enemy.healthBar?.update(enemy.body.center.x, enemy.body.top - 11, enemy.hp, enemy.maxHp,
        enemy.sprite.active && enemy.body.right >= view.left && enemy.body.left <= view.right);
    }
  }
}
