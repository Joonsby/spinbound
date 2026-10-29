import Phaser from 'phaser';
import { BOSS } from './config';
import type { ContactKind } from './contact';
import type { GameEffects } from '../effects';
import { ENEMY_KEYS } from '../graphics/enemy-art';
import { addLabel } from '../graphics/display';

export type BossConfig = { entry: number; left: number; right: number; x: number; y: number };
export type BossRecoil = 'stomp' | 'roll' | 'clang' | 'clang-top' | 'push';
export type BossHooks = {
  contact: (body: Phaser.Physics.Arcade.Body) => ContactKind;
  hurt: (x: number) => void;
  recoil: (x: number, kind: BossRecoil) => void;
  struck: (x: number, y: number) => void;
  minionDown: (x: number, y: number) => void;
  defeated: (x: number, y: number) => void;
  damagePerHit: number;
  frameArena: (left: number, right: number, ground: number) => void;
  releaseCamera: () => void;
};
type State = 'dormant' | 'intro' | 'warning' | 'attack' | 'exposed' | 'recover' | 'dead';
type Pattern = 'charge' | 'wave' | 'drones' | 'debris' | 'combo';
type Unit = { sprite: Phaser.GameObjects.Rectangle; body: Phaser.Physics.Arcade.Body; visual?: Phaser.GameObjects.Image; expires: number; dying?: boolean; landed?: boolean; hp: number; home?: number };

const PATTERNS: Pattern[][] = [['charge', 'wave'], ['charge', 'wave', 'drones', 'debris'], ['combo', 'drones', 'charge', 'debris']];
const TITLES: Record<Pattern, string> = {
  charge: '돌진 예고! 점프로 넘기', wave: '충격파! 타이밍 맞춰 점프', drones: '드론 출격! 밟거나 굴러서 격추',
  debris: '낙하물 주의! 그림자를 피하세요', combo: '충격파 + 돌진! 연속 점프',
};
const BODY = { width: 104, height: 96 };
const VISUAL_OFFSET = -21;
const CORE_OFFSET = 23;
const DRONE_ALTITUDE = 100;
// Drones patrol a fixed stretch of air instead of chasing, so a dodge jump is never punished by surprise.
const DRONE_PATROL = 90;
const DRONE_SPEED = 50;

// Speed-based boss: telegraph → attack → weak point exposed → roll or stomp it.
// One looping timer drives state changes; update() only moves things.
export class MachineBoss {
  private hp = BOSS.maxHp;
  private state: State = 'dormant';
  private phase = 1;
  private pattern: Pattern = 'charge';
  private turn = 0;
  private deadline = 0;
  private direction = -1;
  private charging = false;
  private comboStep = 0;
  // Overlap repeats every step; after a hit or a bounce the boss ignores the player briefly.
  private contactGraceUntil = 0;
  private ground: number;
  private actor: Unit;
  private core: Phaser.GameObjects.Image;
  private hazards: Unit[] = [];
  private drones: Unit[] = [];
  private shadows: Phaser.GameObjects.Image[] = [];
  private targets: Phaser.Physics.Arcade.Group;
  private timer: Phaser.Time.TimerEvent;
  private colliders: Phaser.Physics.Arcade.Collider[] = [];
  private warning: Phaser.GameObjects.Rectangle;
  private label: Phaser.GameObjects.Text;
  private hud: HTMLDivElement;
  private bar: HTMLProgressElement;
  private title: HTMLElement;

  constructor(private scene: Phaser.Scene, private config: BossConfig, private player: Phaser.GameObjects.Rectangle,
    private effects: GameEffects, private hooks: BossHooks) {
    this.ground = config.y + BODY.height / 2;
    createBossTextures(scene);
    this.targets = scene.physics.add.group({ allowGravity: false });
    const make = (kind: string, width: number, height: number, texture?: string, displayWidth?: number, displayHeight?: number): Unit => {
      const sprite = scene.add.rectangle(0, 0, width, height, 0xffffff, 0).setDepth(5);
      scene.physics.add.existing(sprite); this.targets.add(sprite);
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false).setImmovable(true);
      sprite.setData('bossKind', kind);
      const visual = texture ? scene.add.image(0, 0, texture).setDepth(6) : undefined;
      if (visual && displayWidth && displayHeight) visual.setDisplaySize(displayWidth, displayHeight);
      return { sprite, body, visual, expires: 0, hp: 0 };
    };
    this.actor = make('boss', BODY.width, BODY.height, 'forge-boss');
    this.core = scene.add.image(0, 0, 'boss-core').setDepth(7).setVisible(false);
    for (let i = 0; i < 10; i++) this.hazards.push(make('hazard', 36, 26, 'boss-wave', 48, 28));
    for (let i = 0; i < 4; i++) this.drones.push(make('drone', 28, 24, ENEMY_KEYS.drone, 34, 30));
    for (let i = 0; i < 4; i++) this.shadows.push(scene.add.image(0, this.ground - 2, 'boss-shadow').setDepth(1).setVisible(false));
    this.warning = scene.add.rectangle(0, this.ground - 13, 10, 26, 0xff8266, 0.22).setDepth(1).setVisible(false);
    this.label = addLabel(scene, config.x, config.y - 115, '', { fontSize: '18px', fontStyle: 'bold', color: '#FFF0C8', backgroundColor: '#2B2236', padding: { x: 12, y: 6 } }).setOrigin(0.5).setDepth(7);
    this.hud = document.createElement('div'); this.hud.id = 'boss-hud'; this.hud.hidden = true;
    this.title = document.createElement('b');
    this.bar = document.createElement('progress'); this.bar.max = BOSS.maxHp; this.bar.value = BOSS.maxHp; this.bar.setAttribute('aria-label', '보스 HP');
    this.hud.append(this.title, this.bar); document.body.append(this.hud);
    this.colliders.push(scene.physics.add.overlap(player, this.targets, (_player, target) => this.touch(target as Phaser.GameObjects.Rectangle)));
    this.timer = scene.time.addEvent({ delay: 50, loop: true, callback: () => this.tick() });
    this.reset();
  }

  get active() { return this.state !== 'dormant' && this.state !== 'dead'; }
  get defeated() { return this.state === 'dead'; }
  get snapshot() { return { state: this.state, pattern: this.pattern, phase: this.phase, hp: this.hp, x: Math.round(this.actor.sprite.x) }; }

  private touch(sprite: Phaser.GameObjects.Rectangle) {
    if (!this.active || !sprite.active) return;
    const now = this.scene.time.now;
    if (sprite === this.actor.sprite) {
      if (now < this.contactGraceUntil) return;
      const contact = this.hooks.contact(this.actor.body);
      if (this.state === 'exposed') {
        this.contactGraceUntil = now + (contact === 'touch' ? 250 : BOSS.hitCooldownMs);
        this.hooks.recoil(sprite.x, contact === 'touch' ? 'push' : contact);
        if (contact !== 'touch') this.damage();
      } else if (contact === 'touch' || (this.charging && contact === 'roll')) this.hooks.hurt(sprite.x);
      else {
        // Armored: attacks bounce off without hurting either side.
        this.contactGraceUntil = now + 250;
        this.hooks.recoil(sprite.x, contact === 'stomp' ? 'clang-top' : 'clang');
      }
      return;
    }
    const unit = this.drones.find((drone) => drone.sprite === sprite);
    if (!unit) { this.hooks.hurt(sprite.x); return; }
    const contact = this.hooks.contact(unit.body);
    if (contact === 'touch') { this.hooks.hurt(sprite.x); return; }
    this.hooks.recoil(sprite.x, contact);
    unit.hp -= this.hooks.damagePerHit;
    if (unit.hp <= 0) { this.hooks.minionDown(sprite.x, sprite.y); this.deathVisual(unit); }
  }

  private disable(unit: Unit) {
    unit.sprite.setActive(false).setVisible(false); unit.body.enable = false; unit.body.setVelocity(0, 0);
    unit.dying = false; unit.landed = false;
    if (unit.visual) {
      this.scene.tweens.killTweensOf(unit.visual);
      unit.visual.setVisible(false).setAlpha(1).setAngle(0).clearTint();
      if (unit === this.actor) unit.visual.setScale(1);
      else if (unit.sprite.getData('bossKind') === 'drone') unit.visual.setDisplaySize(34, 30);
    }
  }

  private deathVisual(unit: Unit, boss = false) {
    this.disable(unit);
    if (!unit.visual) return;
    unit.dying = true;
    const visual = unit.visual.setVisible(true);
    this.scene.tweens.add({ targets: visual, y: visual.y - 38, angle: 160, scaleX: 0.15, scaleY: 0.15, alpha: 0, duration: boss ? 450 : 320, ease: 'Quad.easeIn', onComplete: () => { visual.setVisible(false); unit.dying = false; } });
  }

  private enable(unit: Unit, x: number, y: number) {
    unit.sprite.setActive(true).setVisible(true); unit.body.enable = true; unit.body.reset(x, y); unit.body.setVelocity(0, 0);
    unit.visual?.setVisible(true).setPosition(x, y);
  }

  private clearAttacks() {
    for (const unit of this.hazards) this.disable(unit);
    for (const unit of this.drones) this.disable(unit);
    for (const shadow of this.shadows) shadow.setVisible(false);
    this.charging = false;
    this.comboStep = 0;
  }

  reset() {
    // Only a fight in progress owns the camera; the constructor's reset must not touch it.
    const fighting = this.state !== 'dormant';
    this.clearAttacks(); this.disable(this.actor);
    this.hp = BOSS.maxHp; this.phase = 1; this.turn = 0; this.contactGraceUntil = 0; this.state = 'dormant';
    this.actor.body.reset(this.config.x, this.config.y);
    this.actor.visual?.setPosition(this.config.x, this.config.y + VISUAL_OFFSET).clearTint().setVisible(true);
    this.core.setVisible(false);
    this.label.setText('FORGE-06').setPosition(this.config.x, this.config.y - 115);
    this.warning.setVisible(false); this.hud.hidden = true; this.bar.value = BOSS.maxHp;
    document.body.classList.remove('boss-fight');
    if (this.timer) this.timer.paused = false;
    if (fighting) this.hooks.releaseCamera();
  }

  update(now: number) {
    if (this.state === 'dormant' && this.player.x >= this.config.entry) {
      this.state = 'intro'; this.deadline = now + 1400;
      this.enable(this.actor, this.config.x, this.config.y);
      this.hud.hidden = false; document.body.classList.add('boss-fight');
      this.refreshHud(); this.label.setText('보스전 시작 · 약점이 열리면 스핀 대시·밟기!');
      this.hooks.frameArena(this.config.left, this.config.right, this.ground);
    }
    if (!this.active) return;
    const { left, right } = this.config;
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    playerBody.x = Phaser.Math.Clamp(playerBody.x, left + 8, right - playerBody.width - 8);
    const body = this.actor.body;
    const minX = left + 16;
    const maxX = right - body.width - 16;
    if (this.charging && ((body.x <= minX && body.velocity.x < 0) || (body.x >= maxX && body.velocity.x > 0))) this.endCharge();
    body.x = Phaser.Math.Clamp(body.x, minX, maxX);
    const visualY = this.actor.sprite.y + VISUAL_OFFSET;
    this.actor.visual?.setPosition(this.actor.sprite.x, visualY);
    this.core.setPosition(this.actor.sprite.x, visualY + CORE_OFFSET);
    if (this.state === 'exposed') this.core.setAlpha(0.65 + Math.sin(now / 90) * 0.35).setScale(1 + Math.sin(now / 90) * 0.08);
    this.label.setPosition(this.actor.sprite.x, this.config.y - 115);
    for (const unit of this.hazards) {
      if (!unit.sprite.active) continue;
      if (!unit.landed && unit.body.velocity.y > 0 && unit.body.bottom >= this.ground) {
        unit.landed = true; unit.body.setVelocityY(0); unit.body.y = this.ground - unit.body.height;
        unit.expires = now + BOSS.debrisLifeMs;
        this.effects.debris(unit.body.center.x, this.ground - 6, 0xb7a08a, 6);
      }
      if (now >= unit.expires || unit.body.right < left || unit.body.left > right) this.disable(unit);
      else unit.visual?.setPosition(unit.sprite.x, unit.sprite.y);
    }
    for (const drone of this.drones) {
      if (!drone.sprite.active) continue;
      if (now >= drone.expires) { this.deathVisual(drone); continue; }
      const hover = this.ground - DRONE_ALTITUDE + Math.sin(now / 320 + drone.expires) * 12;
      const home = drone.home ?? drone.body.center.x;
      let vx = drone.body.velocity.x || DRONE_SPEED;
      if (drone.body.center.x <= home - DRONE_PATROL) vx = DRONE_SPEED;
      else if (drone.body.center.x >= home + DRONE_PATROL) vx = -DRONE_SPEED;
      drone.body.setVelocity(vx, Phaser.Math.Clamp((hover - drone.body.center.y) * 4, -120, 120));
      drone.visual?.setPosition(drone.sprite.x, drone.sprite.y).setFlipX(drone.body.velocity.x < 0);
    }
  }

  private prepare() {
    const now = this.scene.time.now;
    // Patterns never stack: escorts from the last summon withdraw before the next attack.
    for (const drone of this.drones) if (drone.sprite.active) this.deathVisual(drone);
    const patterns = PATTERNS[this.phase - 1]; this.pattern = patterns[this.turn++ % patterns.length];
    this.state = 'warning'; this.deadline = now + BOSS.warningMs[this.phase - 1];
    this.direction = this.player.x < this.actor.sprite.x ? -1 : 1;
    this.label.setText(TITLES[this.pattern]);
    this.actor.visual?.setTint(0xffb385);
    const { left, right } = this.config;
    if (this.pattern === 'charge') {
      const from = this.actor.sprite.x;
      const to = this.direction < 0 ? left : right;
      this.warning.setPosition((from + to) / 2, this.ground - 13).setSize(Math.abs(to - from), 26).setVisible(true);
    } else if (this.pattern === 'wave' || this.pattern === 'combo') {
      this.warning.setPosition((left + right) / 2, this.ground - 13).setSize(right - left, 26).setVisible(true);
    } else if (this.pattern === 'debris') {
      const count = BOSS.debrisCount[this.phase - 1];
      this.shadows.forEach((shadow, index) => {
        const x = Phaser.Math.Clamp(this.player.x + (index - (count - 1) / 2) * 150, left + 40, right - 40);
        shadow.setX(x).setVisible(index < count).setAlpha(0.8);
      });
    }
  }

  private execute() {
    const now = this.scene.time.now;
    this.state = 'attack'; this.warning.setVisible(false); this.actor.visual?.clearTint();
    if (this.pattern === 'charge') this.startCharge();
    else if (this.pattern === 'wave' || this.pattern === 'combo') {
      this.spawnWaves();
      this.comboStep = this.pattern === 'combo' ? 1 : 0;
      this.deadline = now + (this.pattern === 'combo' ? 1200 : 1300);
    } else if (this.pattern === 'drones') {
      let count = 0;
      for (const drone of this.drones) {
        if (drone.sprite.active || drone.dying) continue;
        // Spread across the arena on the boss's open side.
        const { left, right } = this.config;
        const toCentre = this.actor.sprite.x < (left + right) / 2 ? 1 : -1;
        const home = Phaser.Math.Clamp(this.actor.sprite.x + toCentre * (220 + count * 280), left + 120, right - 120);
        this.enable(drone, this.actor.sprite.x, this.ground - DRONE_ALTITUDE - 40);
        drone.body.setVelocityX(Math.sign(home - this.actor.sprite.x) * DRONE_SPEED * 3);
        drone.hp = BOSS.droneHp; drone.expires = now + BOSS.droneLifeMs; drone.home = home;
        if (++count === BOSS.droneCount[this.phase - 1]) break;
      }
      this.deadline = now + 600;
    } else {
      for (const shadow of this.shadows) {
        if (!shadow.visible) continue;
        const unit = this.hazards.find((hazard) => !hazard.sprite.active);
        if (!unit) break;
        unit.visual?.setTexture('boss-scrap').setDisplaySize(40, 34);
        this.enable(unit, shadow.x, this.ground - 360);
        unit.body.setVelocityY(560);
        unit.expires = now + 4000;
        shadow.setVisible(false);
      }
      this.deadline = now + 1200;
    }
  }

  private spawnWaves() {
    for (const direction of [-1, 1]) {
      const unit = this.hazards.find((hazard) => !hazard.sprite.active);
      if (!unit) return;
      unit.visual?.setTexture('boss-wave').setDisplaySize(48, 28).setFlipX(direction < 0);
      this.enable(unit, this.actor.sprite.x + direction * 70, this.ground - 13);
      unit.body.setVelocityX(direction * BOSS.waveSpeed[this.phase - 1]);
      unit.expires = this.scene.time.now + 6000;
    }
    this.scene.cameras.main.shake(90, 0.003);
  }

  private startCharge() {
    this.direction = this.player.x < this.actor.sprite.x ? -1 : 1;
    this.charging = true;
    const speed = BOSS.chargeSpeed[this.phase - 1];
    this.actor.body.setVelocityX(this.direction * speed);
    // The charge always ends against the arena wall (update() calls endCharge); the deadline is only a fallback.
    const edge = this.direction < 0 ? this.config.left + 16 + BODY.width / 2 : this.config.right - 16 - BODY.width / 2;
    this.deadline = this.scene.time.now + Math.abs(edge - this.actor.sprite.x) / speed * 1000 + 400;
  }

  private endCharge() {
    this.charging = false;
    this.actor.body.setVelocityX(0);
    this.scene.cameras.main.shake(120, 0.004);
    this.effects.debris(this.actor.body.center.x + this.direction * BODY.width / 2, this.ground - 30, 0xd8c3a5, 8);
    this.expose();
    this.label.setText('벽에 부딪혀 기절! 스핀 대시로 공격');
  }

  private expose() {
    this.state = 'exposed';
    this.deadline = this.scene.time.now + BOSS.exposedMs[this.phase - 1];
    this.core.setVisible(true);
    this.actor.visual?.setTint(0xfff1c8);
    this.label.setText('약점 노출! 스핀 대시·밟기로 공격');
  }

  private tick() {
    const now = this.scene.time.now;
    if (!this.active || now < this.deadline) return;
    if (this.state === 'intro' || this.state === 'recover') this.prepare();
    else if (this.state === 'warning') this.execute();
    else if (this.state === 'attack') {
      if (this.charging) this.endCharge();
      else if (this.comboStep === 1) { this.comboStep = 2; this.startCharge(); }
      else this.expose();
    } else if (this.state === 'exposed') {
      // Closing the armor never hurts a player standing against it: shove them off and give a moment to step away.
      const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
      if (Math.abs(playerBody.center.x - this.actor.body.center.x) < (BODY.width + playerBody.width) / 2 + 16 && playerBody.bottom > this.actor.body.top) this.hooks.recoil(this.actor.sprite.x, 'push');
      this.contactGraceUntil = now + 600;
      this.state = 'recover'; this.deadline = now + 500;
      this.core.setVisible(false); this.actor.visual?.clearTint(); this.label.setText('');
    }
  }

  private refreshHud() { this.bar.value = this.hp; this.title.textContent = `FORGE-06 · PHASE ${this.phase} · ${this.hp} / ${BOSS.maxHp}`; }

  private damage() {
    if (!this.active) return;
    const { x, y } = this.actor.sprite;
    this.hp = Math.max(0, this.hp - this.hooks.damagePerHit);
    const phase = this.hp > BOSS.phaseHp[0] ? 1 : this.hp > BOSS.phaseHp[1] ? 2 : 3;
    const phaseChanged = phase !== this.phase;
    this.phase = phase;
    this.refreshHud();
    this.hooks.struck(x, y + CORE_OFFSET + VISUAL_OFFSET);
    this.core.setVisible(false);
    if (this.hp === 0) {
      this.state = 'dead'; this.timer.paused = true; this.clearAttacks(); this.deathVisual(this.actor, true); this.warning.setVisible(false); this.label.setText('보스 격파!');
      this.hooks.defeated(x, y);
      return;
    }
    this.actor.visual?.setTint(0xffffff);
    this.scene.tweens.add({ targets: this.actor.visual, alpha: 0.4, duration: 70, yoyo: true, repeat: 2, onComplete: () => this.actor.visual?.setAlpha(1).clearTint() });
    this.state = 'recover';
    this.deadline = this.scene.time.now + BOSS.recoverMs;
    this.label.setText(phaseChanged ? `PHASE ${phase}! 공격이 빨라집니다` : '명중!');
  }

  halt() { this.timer.paused = true; this.clearAttacks(); this.actor.body.setVelocity(0, 0); }
  destroy() { this.halt(); this.timer.remove(false); this.colliders.forEach((collider) => collider.destroy()); this.hud.remove(); document.body.classList.remove('boss-fight'); }
}

function createBossTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('forge-boss')) return;
  const g = scene.make.graphics({ x: 0, y: 0 });
  g.fillStyle(0x394454); g.fillRoundedRect(12, 121, 136, 28, 12);
  g.fillStyle(0x8b98a4); for (let x = 25; x < 145; x += 23) g.fillCircle(x, 136, 8);
  g.fillStyle(0xdce3df); g.fillRoundedRect(26, 24, 108, 106, 35);
  g.fillStyle(0xe59c55); g.fillRoundedRect(20, 48, 23, 67, 10); g.fillRoundedRect(117, 48, 23, 67, 10);
  g.fillStyle(0x354454); g.fillRoundedRect(45, 44, 70, 34, 13);
  g.fillStyle(0x93eddb); g.fillRoundedRect(57, 56, 14, 9, 4); g.fillRoundedRect(89, 56, 14, 9, 4);
  // Armored chest plate; the glowing core is a separate image shown only when exposed.
  g.fillStyle(0x65788b); g.fillCircle(80, 103, 23);
  g.fillStyle(0x4a5866); g.fillCircle(80, 103, 15);
  g.lineStyle(3, 0x8b98a4); g.lineBetween(66, 103, 94, 103); g.lineBetween(80, 89, 80, 117);
  g.fillStyle(0x728b99); g.fillRoundedRect(68, 9, 24, 20, 7);
  g.fillStyle(0xffce81); g.fillCircle(80, 12, 6);
  g.generateTexture('forge-boss', 160, 160);
  g.clear();
  g.fillStyle(0xffd27a, 0.35); g.fillCircle(24, 24, 24);
  g.fillStyle(0xf6b76e); g.fillCircle(24, 24, 15);
  g.fillStyle(0xffefd0); g.fillCircle(24, 24, 8);
  g.generateTexture('boss-core', 48, 48);
  g.clear();
  g.fillStyle(0xff8a5c, 0.5); g.fillEllipse(24, 22, 48, 16);
  g.fillStyle(0xffb46e); g.fillTriangle(4, 28, 24, 2, 44, 28);
  g.fillStyle(0xfff0c8); g.fillTriangle(16, 28, 24, 12, 32, 28);
  g.generateTexture('boss-wave', 48, 28);
  g.clear();
  g.fillStyle(0x5c5560); g.fillRoundedRect(2, 14, 36, 20, 6);
  g.fillStyle(0x8f8794); g.fillRoundedRect(6, 8, 18, 14, 4); g.fillRoundedRect(20, 4, 14, 16, 4);
  g.fillStyle(0xff8f86); g.fillTriangle(8, 8, 12, 0, 16, 8); g.fillTriangle(24, 4, 28, -4, 32, 4);
  g.generateTexture('boss-scrap', 40, 34);
  g.clear();
  g.fillStyle(0x1b1424, 0.45); g.fillEllipse(24, 6, 48, 12);
  g.generateTexture('boss-shadow', 48, 12);
  g.destroy();
}
