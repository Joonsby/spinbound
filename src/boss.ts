import Phaser from 'phaser';
import { MonsterHealthBar } from './health-bar';

export type BossConfig = { entry: number; left: number; right: number; x: number; y: number };
type State = 'dormant' | 'intro' | 'warning' | 'attack' | 'stunned' | 'recover' | 'dead';
type Pattern = 'barrage' | 'wave' | 'charge' | 'drones' | 'combo';
type Unit = { sprite: Phaser.GameObjects.Rectangle; body: Phaser.Physics.Arcade.Body; visual?: Phaser.GameObjects.Image; expires: number; dying?: boolean; healthBar?: MonsterHealthBar };
const MAX_HP = 600;
const PATTERNS: Pattern[][] = [['barrage', 'wave'], ['barrage', 'wave', 'charge', 'drones'], ['combo', 'charge', 'drones', 'combo']];

export class MachineBoss {
  private hp = MAX_HP;
  private state: State = 'dormant';
  private phase = 1;
  private pattern: Pattern = 'barrage';
  private turn = 0;
  private deadline = 0;
  private direction = -1;
  private nextContactAt = 0;
  private viewWidth = 0;
  private actor: Unit;
  private shots: Unit[] = [];
  private drones: Unit[] = [];
  private targets: Phaser.Physics.Arcade.Group;
  private timer: Phaser.Time.TimerEvent;
  private colliders: Phaser.Physics.Arcade.Collider[] = [];
  private warning: Phaser.GameObjects.Rectangle;
  private label: Phaser.GameObjects.Text;
  private hud: HTMLDivElement;
  private bar: HTMLProgressElement;
  private title: HTMLElement;

  constructor(private scene: Phaser.Scene, private config: BossConfig, private player: Phaser.GameObjects.Rectangle,
    bullets: Phaser.Physics.Arcade.Group, private worldWidth: number,
    private hooks: { isSpeed: () => boolean; hurt: (x: number) => void; recycle: (bullet: Phaser.GameObjects.Rectangle) => void; bulletDamage: number; contactDamage: number; contactCooldown: number; defeated: (x: number, y: number) => void }) {
    if (!scene.textures.exists('forge-boss')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x394454); g.fillRoundedRect(12, 121, 136, 28, 12);
      g.fillStyle(0x8b98a4); for (let x = 25; x < 145; x += 23) g.fillCircle(x, 136, 8);
      g.fillStyle(0xdce3df); g.fillRoundedRect(26, 24, 108, 106, 35);
      g.fillStyle(0xe59c55); g.fillRoundedRect(20, 48, 23, 67, 10); g.fillRoundedRect(117, 48, 23, 67, 10);
      g.fillStyle(0x354454); g.fillRoundedRect(45, 44, 70, 34, 13);
      g.fillStyle(0x93eddb); g.fillRoundedRect(57, 56, 14, 9, 4); g.fillRoundedRect(89, 56, 14, 9, 4);
      g.fillStyle(0x65788b); g.fillCircle(80, 103, 23);
      g.fillStyle(0xf6b76e); g.fillCircle(80, 103, 15);
      g.fillStyle(0xffefd0); g.fillCircle(80, 103, 7);
      g.fillStyle(0x728b99); g.fillRoundedRect(68, 9, 24, 20, 7);
      g.fillStyle(0xffce81); g.fillCircle(80, 12, 6);
      g.generateTexture('forge-boss', 160, 160); g.destroy();
    }
    this.targets = scene.physics.add.group({ allowGravity: false });
    const make = (kind: string, width: number, height: number, color: number, texture?: string): Unit => {
      const sprite = scene.add.rectangle(0, 0, width, height, color).setDepth(5);
      scene.physics.add.existing(sprite); this.targets.add(sprite);
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false).setImmovable(true);
      sprite.setData('bossKind', kind);
      let visual: Phaser.GameObjects.Image | undefined;
      if (texture) {
        sprite.isFilled = false; visual = scene.add.image(0, 0, texture).setDepth(6);
        if (kind === 'drone') visual.setDisplaySize(42, 32);
      }
      return { sprite, body, visual, expires: 0, healthBar: kind === 'drone' ? new MonsterHealthBar(scene, 30) : undefined };
    };
    this.actor = make('boss', 112, 114, 0xffffff, 'forge-boss');
    for (let i = 0; i < 24; i++) this.shots.push(make('shot', 12, 12, 0xff9f72));
    for (let i = 0; i < 4; i++) this.drones.push(make('drone', 28, 24, 0x94dcca, 'enemy-fly-0'));
    this.warning = scene.add.rectangle((config.left + config.right) / 2, 465, config.right - config.left, 26, 0xff8266, 0.22).setDepth(4).setVisible(false);
    this.label = scene.add.text(config.x, config.y - 105, '', { fontSize: '18px', color: '#fff0c8', backgroundColor: '#473044', padding: { x: 10, y: 6 } }).setOrigin(0.5).setDepth(7);
    this.hud = document.createElement('div'); this.hud.id = 'boss-hud'; this.hud.hidden = true;
    this.title = document.createElement('b');
    this.bar = document.createElement('progress'); this.bar.max = MAX_HP; this.bar.value = MAX_HP; this.bar.setAttribute('aria-label', '보스 HP');
    this.hud.append(this.title, this.bar); document.body.append(this.hud);
    this.colliders.push(scene.physics.add.overlap(bullets, this.targets, (projectile, target) => {
      const bullet = projectile as Phaser.GameObjects.Rectangle;
      const sprite = target as Phaser.GameObjects.Rectangle;
      if (!this.active || !bullet.active || !sprite.active) return;
      hooks.recycle(bullet);
      if (sprite === this.actor.sprite) this.damage(hooks.bulletDamage);
      else if (sprite.getData('bossKind') === 'shot') this.disable(this.shots.find((unit) => unit.sprite === sprite)!);
      else {
        const hp = (sprite.getData('hp') as number) - hooks.bulletDamage;
        sprite.setData('hp', hp);
        if (hp <= 0) this.deathVisual(this.drones.find((unit) => unit.sprite === sprite)!);
      }
    }));
    this.colliders.push(scene.physics.add.overlap(player, this.targets, (_player, target) => {
      const sprite = target as Phaser.GameObjects.Rectangle;
      if (!this.active || !sprite.active) return;
      if (sprite === this.actor.sprite && this.state === 'stunned') {
        if (hooks.isSpeed() && scene.time.now >= this.nextContactAt) {
          this.nextContactAt = scene.time.now + hooks.contactCooldown;
          this.damage(hooks.contactDamage);
        }
        return;
      }
      hooks.hurt(sprite.x);
      if (sprite.getData('bossKind') === 'shot') this.disable(this.shots.find((unit) => unit.sprite === sprite)!);
    }));
    // One scheduler per boss. State transitions never allocate timers in update().
    this.timer = scene.time.addEvent({ delay: 100, loop: true, callback: () => this.tick() });
    this.reset();
  }

  get active() { return this.state !== 'dormant' && this.state !== 'dead'; }
  get defeated() { return this.state === 'dead'; }

  private disable(unit: Unit) {
    unit.healthBar?.hide();
    unit.sprite.setActive(false).setVisible(false); unit.body.enable = false; unit.body.setVelocity(0, 0); unit.visual?.setVisible(false);
    unit.dying = false;
    if (unit.visual) {
      this.scene.tweens.killTweensOf(unit.visual);
      unit.visual.setAlpha(1).setAngle(0);
      if (unit === this.actor) unit.visual.setScale(1);
      else unit.visual.setDisplaySize(42, 32);
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
    unit.sprite.setActive(true).setVisible(true); unit.body.enable = true; unit.body.reset(x, y); unit.body.setVelocity(0, 0); unit.visual?.setVisible(true);
  }
  private clearAttacks() { for (const unit of this.shots) this.disable(unit); for (const unit of this.drones) this.disable(unit); }

  reset() {
    this.clearAttacks(); this.disable(this.actor);
    this.hp = MAX_HP; this.phase = 1; this.turn = 0; this.nextContactAt = 0; this.viewWidth = 0; this.state = 'dormant';
    this.actor.body.reset(this.config.x, this.config.y);
    this.actor.visual?.setPosition(this.config.x, this.config.y - 18).clearTint().setVisible(true);
    this.label.setText('FORGE-06').setPosition(this.config.x, this.config.y - 115);
    this.warning.setVisible(false); this.hud.hidden = true; this.bar.value = MAX_HP;
    document.body.classList.remove('boss-fight');
    if (this.timer) this.timer.paused = false;
    this.scene.cameras.main.setZoom(1).setBounds(0, 0, this.worldWidth, 600).startFollow(this.player, true, 1, 1, 0, 0);
  }

  hasTarget(x: number, y: number, facing: number, range: number) {
    if (!this.active) return false;
    return this.targets.getChildren().some((object) => {
      const sprite = object as Phaser.GameObjects.Rectangle;
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      const distance = (body.center.x - x) * facing;
      return sprite.active && body.enable && distance >= 0 && distance <= range && y >= body.top - 4 && y <= body.bottom + 4;
    });
  }

  update() {
    if (this.state === 'dormant' && this.player.x >= this.config.entry) {
      this.state = 'intro'; this.deadline = this.scene.time.now + 1400;
      this.enable(this.actor, this.config.x, this.config.y);
      this.hud.hidden = false; document.body.classList.add('boss-fight');
      this.refreshHud(); this.label.setText('보스전 시작 · 공격 예고를 확인하세요');
    }
    if (!this.active) return;
    const camera = this.scene.cameras.main;
    if (camera.width !== this.viewWidth) {
      this.viewWidth = camera.width;
      camera.stopFollow(); camera.setZoom(Math.min(1, camera.width / (this.config.right - this.config.left)));
      camera.setBounds(this.config.left, 0, this.config.right - this.config.left, 600).centerOn((this.config.left + this.config.right) / 2, 300);
    }
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    playerBody.x = Phaser.Math.Clamp(playerBody.x, this.config.left + 8, this.config.right - playerBody.width - 8);
    this.actor.body.x = Phaser.Math.Clamp(this.actor.body.x, this.config.left + 16, this.config.right - this.actor.body.width - 16);
    this.actor.visual?.setPosition(this.actor.sprite.x, this.actor.sprite.y - 18);
    this.label.setPosition(this.actor.sprite.x, this.actor.sprite.y - 115);
    for (const shot of this.shots) {
      if (shot.sprite.active && (this.scene.time.now >= shot.expires || shot.body.right < this.config.left || shot.body.left > this.config.right || shot.body.top < 0 || shot.body.bottom > 600)) this.disable(shot);
    }
    for (const drone of this.drones) {
      if (!drone.sprite.active) continue;
      drone.body.setVelocity(Phaser.Math.Clamp((this.player.x - drone.body.center.x) * 0.7, -100, 100), Phaser.Math.Clamp((this.player.y - 45 - drone.body.center.y) * 0.5, -65, 65));
      drone.visual?.setPosition(drone.sprite.x, drone.sprite.y);
      drone.healthBar?.update(drone.body.center.x, drone.body.top - 9, drone.sprite.getData('hp') as number, 20, true);
    }
  }

  private prepare() {
    const patterns = PATTERNS[this.phase - 1]; this.pattern = patterns[this.turn++ % patterns.length];
    this.state = 'warning'; this.deadline = this.scene.time.now + (this.phase === 3 ? 850 : 1000);
    this.direction = this.player.x < this.actor.sprite.x ? -1 : 1;
    const titles = { barrage: '전방 탄막! 사격으로 제거', wave: '바닥 충격파! 점프', charge: '돌진 예고! 회피 후 기절 공략', drones: '드론 전개! 공격모드로 대응', combo: '탄막 + 충격파! 사격하며 점프' };
    this.label.setText(titles[this.pattern]);
    this.warning.setY(this.pattern === 'charge' ? this.config.y : 466).setVisible(this.pattern === 'wave' || this.pattern === 'charge' || this.pattern === 'combo');
    this.actor.visual?.setTint(0xffb385);
  }

  private spawnShot(wave: boolean, vertical = 0) {
    const unit = this.shots.find((shot) => !shot.sprite.active); if (!unit) return;
    unit.sprite.setDisplaySize(wave ? 40 : 12, wave ? 18 : 12);
    this.enable(unit, this.actor.sprite.x + this.direction * 75, wave ? 468 : this.actor.sprite.y - 8);
    unit.body.setVelocity(this.direction * (this.phase === 3 ? 290 : 210), vertical);
    unit.expires = this.scene.time.now + 6500;
  }

  private execute() {
    this.state = 'attack'; this.warning.setVisible(false); this.actor.visual?.clearTint();
    if (this.pattern === 'barrage' || this.pattern === 'combo') for (let i = -2; i <= 2; i++) this.spawnShot(false, i * (this.phase === 3 ? 85 : 60));
    if (this.pattern === 'wave' || this.pattern === 'combo') this.spawnShot(true);
    if (this.pattern === 'drones') {
      let count = 0;
      for (const drone of this.drones) {
        if (drone.sprite.active || drone.dying) continue;
        this.enable(drone, this.actor.sprite.x + this.direction * 100, 295 + count * 65);
        drone.sprite.setData('hp', 20);
        if (++count === 2) break;
      }
    }
    if (this.pattern === 'charge') this.actor.body.setVelocityX(this.direction * (this.phase === 3 ? 520 : 380));
    this.deadline = this.scene.time.now + (this.pattern === 'charge' ? 800 : 500);
  }

  private tick() {
    if (!this.active || this.scene.time.now < this.deadline) return;
    if (this.state === 'intro' || this.state === 'recover') this.prepare();
    else if (this.state === 'warning') this.execute();
    else if (this.state === 'attack') {
      this.actor.body.setVelocityX(0);
      this.state = this.pattern === 'charge' ? 'stunned' : 'recover';
      this.deadline = this.scene.time.now + (this.state === 'stunned' ? 1500 : this.phase === 3 ? 450 : 750);
      this.label.setText(this.state === 'stunned' ? '기절! 기동모드 접촉 공격 가능' : '');
    } else if (this.state === 'stunned') { this.state = 'recover'; this.deadline = this.scene.time.now + 500; this.label.setText(''); }
  }

  private refreshHud() { this.bar.value = this.hp; this.title.textContent = `FORGE-06 · PHASE ${this.phase} · ${this.hp} / ${MAX_HP}`; }
  private damage(amount: number) {
    if (!this.active) return;
    this.hp = Math.max(0, this.hp - amount); this.phase = this.hp > 420 ? 1 : this.hp > 180 ? 2 : 3; this.refreshHud();
    if (this.hp === 0) {
      this.state = 'dead'; this.timer.paused = true; this.clearAttacks(); this.deathVisual(this.actor, true); this.warning.setVisible(false); this.label.setText('보스 격파!');
      this.hooks.defeated(this.actor.sprite.x, this.actor.sprite.y);
    }
  }
  halt() { this.timer.paused = true; this.clearAttacks(); this.actor.body.setVelocity(0, 0); }
  destroy() { this.halt(); this.timer.remove(false); this.colliders.forEach((collider) => collider.destroy()); this.hud.remove(); document.body.classList.remove('boss-fight'); }
}
