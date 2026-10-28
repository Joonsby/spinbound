import Phaser from 'phaser';
import { STAGES, type EnemyKind } from './stages';
import { createBackground, createTextures, THEMES, type PlayerPose } from './visuals';
import { closeAudio, GameAudio, GameEffects } from './effects';
import { bindAppEnvironment } from './app-environment';
import { installPerformanceDiagnostics } from './performance';
import { MachineBoss } from './boss';
import { MainMenuScene, MenuScreenScene } from './menus';
import { getPlayerProgress, getEquippedRobot, unlockNextStage } from './progress';
import { MonsterHealthBar } from './health-bar';
import './style.css';

const MOVE_SPEED = 270;
const DASH_SPEED = MOVE_SPEED * 1.4;
const ATTACK_SPEED = MOVE_SPEED * 0.7;
const MAX_ENERGY = 100;
const FLIGHT_COST_PER_SECOND = 20;
const ENERGY_REGEN_PER_SECOND = 15;
const FLIGHT_THRUST = 1500;
const FLIGHT_SPEED = 180;
const SHOT_INTERVAL_MS = 180;
const BULLET_DAMAGE = 10;
const BULLET_SPEED = 720;
const BULLET_LIFETIME_MS = 1000;
const BULLET_POOL_SIZE = 16;
const MOVE_ACCELERATION = 900;
const DASH_ACCELERATION = 1400;
const DASH_CONTACT_DAMAGE = 15;
const DASH_ATTACK_COOLDOWN_MS = 500;
const ENEMY_HP = 30;
const AIR_ACCELERATION = 650;
const DECELERATION = 700;
const JUMP_SPEED = 570;
const COIN_SCORE = 100;
const ENEMY_SCORE = 200;
const MAX_HP = 3;
const ENEMY_SPEED = 65;
const INVULNERABLE_MS = 1000;
const KNOCKBACK_MS = 200;
const KNOCKBACK_SPEED = 260;
const STOMP_BOUNCE = 380;
const SPRING_SPEED = 820;
const BOOST_MULTIPLIER = 1.5;
const BOOST_MS = 1500;
const PLATFORM_SPEED = 60;
const START = { x: 90, y: 440 };
const CHECKPOINT_INACTIVE = 0x8294b0;
const CHECKPOINT_ACTIVE = 0x60dfb1;

type Enemy = {
  healthBar: MonsterHealthBar;
  sprite: Phaser.GameObjects.Rectangle;
  visual: Phaser.GameObjects.Sprite;
  body: Phaser.Physics.Arcade.Body;
  kind: EnemyKind;
  min: number;
  max: number;
  baseY: number;
  state: 'idle' | 'windup' | 'charge' | 'recover';
  until: number;
  direction: number;
};

const status = document.querySelector<HTMLParagraphElement>('#status')!;
const scoreHud = document.querySelector<HTMLElement>('#score')!;
const coinHud = document.querySelector<HTMLElement>('#coin-count')!;
const hpHud = document.querySelector<HTMLElement>('#hp')!;
const modeHud = document.querySelector<HTMLElement>('#mode-state')!;
const energyHud = document.querySelector<HTMLElement>('#energy')!;
const modeButton = document.querySelector<HTMLButtonElement>('[data-control="mode"]')!;
const jumpButton = document.querySelector<HTMLButtonElement>('[data-control="jump"]')!;
const result = document.querySelector<HTMLElement>('#result')!;
const resultTitle = document.querySelector<HTMLElement>('#result-title')!;
const resultStats = document.querySelector<HTMLElement>('#result-stats')!;
const stageHud = document.querySelector<HTMLElement>('#stage-label')!;
const nextButton = document.querySelector<HTMLButtonElement>('#result-next')!;
const controls = { left: new Set<number>(), right: new Set<number>(), jump: new Set<number>(), mode: new Set<number>() };
let jumpQueued = false;
let modeToggleCount = 0;

function clearControls() {
  Object.values(controls).forEach((pointers) => pointers.clear());
  document.querySelectorAll('.pressed').forEach((button) => button.classList.remove('pressed'));
  jumpQueued = false;
  modeToggleCount = 0;
}

document.querySelectorAll<HTMLButtonElement>('[data-control]').forEach((button) => {
  const control = button.dataset.control as keyof typeof controls;
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    if (control === 'mode' && controls.mode.size === 0) modeToggleCount += 1;
    controls[control].add(event.pointerId);
    button.classList.add('pressed');
    if (control === 'jump') jumpQueued = true;
  });
  const release = (event: PointerEvent) => {
    controls[control].delete(event.pointerId);
    if (!controls[control].size) button.classList.remove('pressed');
  };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
});
window.addEventListener('blur', clearControls);
document.addEventListener('visibilitychange', clearControls);
document.addEventListener('contextmenu', (event) => event.preventDefault());
document.addEventListener('dblclick', (event) => event.preventDefault());

class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }
  private playerStats = getPlayerProgress().stats;
  private robot = getEquippedRobot();
  private stageIndex = 0;
  private playerVisual!: Phaser.GameObjects.Sprite;
  private playerPose: PlayerPose | '' = '';
  private audio!: GameAudio;
  private effects!: GameEffects;
  private wasGrounded = false;
  private lastVerticalSpeed = 0;
  private resultTimer?: Phaser.Time.TimerEvent;
  private visuals: { source: Phaser.GameObjects.Shape; sprite: Phaser.GameObjects.Sprite; offsetY: number; flip: boolean; isStatic: boolean; scaleX: number; scaleY: number }[] = [];
  private player!: Phaser.GameObjects.Rectangle;
  private body!: Phaser.Physics.Arcade.Body;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private finished = false;
  private deaths = 0;
  private coins!: Phaser.Physics.Arcade.StaticGroup;
  private coinCount = 0;
  private enemyScore = 0;
  private stageStartCoins = 0;
  private stageStartEnemyScore = 0;
  private hp = MAX_HP;
  private invulnerableUntil = 0;
  private knockbackUntil = 0;
  private checkpointActive = false;
  private lastCheckpoint = -1;
  private respawnPoint = START;
  private currentSection = -1;
  private boostUntil = 0;
  private mode: 'ATTACK' | 'SPEED' = 'SPEED';
  private energy = MAX_ENERGY;
  private shownEnergy = -1;
  private flying = false;
  private nextShotAt = 0;
  private nextThrusterAt = 0;
  private bullets!: Phaser.Physics.Arcade.Group;
  private bulletPool: { sprite: Phaser.GameObjects.Rectangle; body: Phaser.Physics.Arcade.Body; expires: number }[] = [];
  private facing = 1;
  private specialPads: { sprite: Phaser.GameObjects.Rectangle; kind: 'spring' | 'boost'; triggered: boolean }[] = [];
  private movingPlatforms: { sprite: Phaser.GameObjects.Rectangle; body: Phaser.Physics.Arcade.Body; axis: 'x' | 'y'; min: number; max: number; x: number; y: number }[] = [];
  private enemies: Enemy[] = [];
  private boss?: MachineBoss;
  private bossTest = false;

  init(data: { stageIndex?: number; hp?: number; coinCount?: number; enemyScore?: number; bossTest?: boolean } = {}) {
    this.playerStats = getPlayerProgress().stats;
    this.robot = getEquippedRobot();
    this.bossTest = data.bossTest === true;
    this.stageIndex = this.bossTest ? 2 : Phaser.Math.Clamp(Math.floor(data.stageIndex ?? 0), 0, Math.min(STAGES.length, getPlayerProgress().unlockedStage) - 1);
    this.hp = Math.min(data.hp ?? this.playerStats.maxHp, this.playerStats.maxHp);
    this.coinCount = data.coinCount ?? 0;
    this.enemyScore = data.enemyScore ?? 0;
    this.stageStartCoins = this.coinCount;
    this.stageStartEnemyScore = this.enemyScore;
    this.finished = false;
    this.deaths = 0;
    this.checkpointActive = false;
    this.lastCheckpoint = -1;
    this.respawnPoint = START;
    this.currentSection = -1;
    this.invulnerableUntil = 0;
    this.knockbackUntil = 0;
    this.boostUntil = 0;
    this.facing = 1;
    this.specialPads = [];
    this.movingPlatforms = [];
    this.enemies = [];
    this.boss = undefined;
    this.visuals = [];
    this.playerPose = '';
    this.wasGrounded = false;
    this.lastVerticalSpeed = 0;
    this.resultTimer = undefined;
    this.bulletPool = [];
    this.energy = this.playerStats.maxEnergy;
    this.shownEnergy = -1;
    this.flying = false;
    this.nextThrusterAt = 0;
    clearControls();
    this.setMode('SPEED');
    this.updateEnergyHud();
    document.querySelector<HTMLElement>('#max-energy')!.textContent = String(this.playerStats.maxEnergy);
    result.hidden = true;
    nextButton.hidden = true;
  }

  private updateScore() {
    scoreHud.textContent = String(this.coinCount * COIN_SCORE + this.enemyScore);
    coinHud.textContent = String(this.coinCount);
    hpHud.textContent = `${this.hp} / ${this.playerStats.maxHp}`;
  }

  create() {
    document.body.dataset.screen = document.documentElement.dataset.screen = 'game';
    createTextures(this);
    const stage = STAGES[this.stageIndex];
    const spawn = this.bossTest && stage.boss ? { x: stage.boss.entry + 40, y: 450 } : START;
    if (this.bossTest) this.respawnPoint = spawn;
    this.audio = new GameAudio(stage.theme);
    this.effects = new GameEffects(this);
    this.cameras.main.setZoom(1);
    const theme = THEMES[stage.theme];
    document.body.style.setProperty('--accent', theme.accent);
    document.body.dataset.theme = String(stage.theme);
    const goalX = stage.width - 130;
    const goalY = stage.goalY ?? 420;
    stageHud.textContent = `STAGE ${this.stageIndex + 1} / ${STAGES.length}`;
    status.textContent = `${stage.name} · ← → / A D 이동 · Space 점프 · Tab 모드 전환 · 공격모드에서 점프 유지: 비행`;
    this.physics.resume();
    this.physics.world.setBounds(0, -200, stage.width, 1100);
    const trackGraphic = createBackground(this, stage.theme, stage.width);

    const ground = this.physics.add.staticGroup();
    const upperGround = this.physics.add.staticGroup();
    const platform = (x: number, y: number, width: number, height: number, oneWay = false) => {
      const block = this.add.rectangle(x, y, width, height, theme.soil, 0);
      block.setVisible(false);
      this.physics.add.existing(block, true);
      (oneWay ? upperGround : ground).add(block);
      this.add.tileSprite(x, y, width, height, `terrain-${stage.theme}`);
      const trim = this.add.graphics();
      trackGraphic(trim, x - width / 2, x + width / 2);
      trim.fillStyle(theme.top);
      trim.fillRoundedRect(x - width / 2, y - height / 2, width, 8, 3);
      trim.fillStyle(theme.top, 0.65);
      for (let dx = 8; dx < width; dx += 28) trim.fillTriangle(x - width / 2 + dx, y - height / 2 + 6, x - width / 2 + dx + 5, y - height / 2 + 13, x - width / 2 + dx + 11, y - height / 2 + 6);
    };
    stage.platforms.forEach(([x, y, width, height]) => platform(x, y, width, height));
    stage.oneWayPlatforms?.forEach(([x, y, width, height]) => platform(x, y, width, height, true));
    stage.signs?.forEach((sign) => this.add.text(sign.x, sign.y, sign.text, { fontSize: '14px', color: '#fff4cf', backgroundColor: '#294d49', padding: { x: 10, y: 7 } }).setOrigin(0.5));

    this.coins = this.physics.add.staticGroup();
    for (const [x, y] of stage.coins) {
      const coin = this.add.circle(x, y, 11, 0xffd35a).setStrokeStyle(3, 0xffedac);
      this.physics.add.existing(coin, true);
      this.coins.add(coin);
      this.attachVisual(coin, 'coin-0', 28, 28).play('coin-spin');
    }
    this.updateScore();

    const hazards = this.physics.add.staticGroup();
    const traps: [number, number][] = [...stage.spikes.map((x): [number, number] => [x, 465]), ...(stage.traps ?? [])];
    for (const [x, y] of traps) {
      const spike = this.add.triangle(x, y, 0, 30, 18, 0, 36, 30, 0xff6f80);
      this.physics.add.existing(spike, true);
      hazards.add(spike);
      (spike.body as Phaser.Physics.Arcade.StaticBody).setSize(24, 24).setOffset(6, 6);
      this.attachVisual(spike, 'spike-art', 36, 30);
    }

    this.add.rectangle(goalX, goalY, 6, 120, 0xeaf2ff);
    this.add.triangle(goalX + 27, goalY - 42, 0, 0, 48, 18, 0, 36, 0x60dfb1);
    this.add.text(goalX - 42, goalY - 90, 'GOAL', { fontSize: '16px', color: '#60dfb1' });
    const goal = this.add.rectangle(goalX, goalY, 44, 120, 0x60dfb1, 0.12);
    this.physics.add.existing(goal, true);
    this.player = this.add.rectangle(spawn.x, spawn.y, 30, 42, 0x69b9ff).setDepth(2);
    this.player.setStrokeStyle(3, 0xc1e7ff);
    this.playerVisual = this.attachVisual(this.player, this.robot.texture, 48, 64, -11).setDepth(4);
    this.physics.add.existing(this.player);
    this.body = this.player.body as Phaser.Physics.Arcade.Body;
    this.body.setMaxVelocity(DASH_SPEED * BOOST_MULTIPLIER, 900);
    for (const [x, kind, padY = 472] of stage.pads) {
      const color = kind === 'spring' ? 0xffa855 : 0x42dfff;
      const sprite = this.add.rectangle(x, padY, 66, 16, color).setStrokeStyle(2, 0xffffff);
      this.physics.add.existing(sprite, true);
      const pad = { sprite, kind, triggered: false };
      this.specialPads.push(pad);
      this.attachVisual(sprite, `${kind}-art`, 66, 16);
      this.add.text(x, padY + 28, kind === 'spring' ? 'SPRING ↑' : 'BOOST »', { fontSize: '12px', color: kind === 'spring' ? '#ffa855' : '#42dfff' }).setOrigin(0.5);
      this.physics.add.collider(this.player, sprite, () => {
        if (this.finished || pad.triggered || !(this.body.blocked.down || this.body.touching.down) || this.body.velocity.y < 0 || this.time.now < this.knockbackUntil) return;
        pad.triggered = true;
        this.flashTerrain(sprite);
        if (kind === 'spring') {
          this.body.setVelocityY(-SPRING_SPEED);
          this.audio.play('jump');
        } else {
          this.boostUntil = this.time.now + BOOST_MS;
          const direction = Math.sign(this.body.velocity.x) || this.facing;
          this.body.setVelocityX(direction * Math.min(DASH_SPEED, Math.max(MOVE_SPEED, Math.abs(this.body.velocity.x))) * BOOST_MULTIPLIER);
        }
      }, () => !this.finished && this.body.velocity.y >= 0 && this.body.prev.y + this.body.height <= (sprite.body as Phaser.Physics.Arcade.StaticBody).top + 6);
    }
    for (const config of stage.movingPlatforms) {
      const sprite = this.add.rectangle(config.x, config.y, 110, 20, 0x9280ff).setStrokeStyle(3, 0xd4cdff);
      this.physics.add.existing(sprite);
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false).setImmovable(true).setFriction(1, 1);
      body.checkCollision.down = false;
      body.checkCollision.left = false;
      body.checkCollision.right = false;
      if (config.axis === 'x') body.setVelocityX(PLATFORM_SPEED);
      else body.setVelocityY(-PLATFORM_SPEED);
      this.movingPlatforms.push({ ...config, sprite, body });
      this.attachVisual(sprite, 'moving-art', 110, 20);
      this.physics.add.collider(this.player, sprite);
      this.tweens.add({ targets: sprite, alpha: 0.65, duration: 700, yoyo: true, repeat: -1 });
    }
    const enemyConfigs = [
      ...stage.enemies.map(([min, max]) => ({ kind: 'patrol' as EnemyKind, x: min, y: 462, min, max })),
      ...(stage.enemyDetails ?? []),
    ];
    const enemyTargets = this.physics.add.group({ allowGravity: false });
    for (const config of enemyConfigs) {
      const { kind, x, y, min, max } = config;
      const sprite = this.add.rectangle(x, y, 34, 36, 0xd783ff).setStrokeStyle(3, 0xf2d5ff);
      this.physics.add.existing(sprite);
      enemyTargets.add(sprite);
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false).setVelocityX(kind === 'charger' ? 0 : ENEMY_SPEED);
      const key = kind === 'fly' ? 'enemy-fly' : kind === 'charger' ? 'enemy-charge' : 'enemy';
      const visual = this.attachVisual(sprite, `${key}-0`, kind === 'fly' ? 56 : 44, 42, -3, true).play(kind === 'patrol' ? 'enemy-walk' : key);
      sprite.setData('contactReadyAt', this.stageIndex === 0 ? Infinity : 0);
      sprite.setData('hp', ENEMY_HP);
      sprite.setData('nextDashAttackAt', 0);
      this.enemies.push({ sprite, visual, body, kind, min, max, baseY: y, state: 'idle', until: 0, direction: 1, healthBar: new MonsterHealthBar(this) });
    }
    this.physics.add.overlap(this.player, enemyTargets, (_player, object) => {
      this.hitEnemy(object as Phaser.GameObjects.Rectangle);
    });
    this.bullets = this.physics.add.group({ allowGravity: false, maxSize: BULLET_POOL_SIZE });
    for (let i = 0; i < BULLET_POOL_SIZE; i++) {
      const sprite = this.add.rectangle(0, 0, 12, 5, 0xffd47e).setDepth(5).setName('pooled-bullet');
      this.physics.add.existing(sprite);
      this.bullets.add(sprite);
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      this.bulletPool.push({ sprite, body, expires: 0 });
      this.recycleBullet(sprite);
    }
    this.physics.add.overlap(this.bullets, enemyTargets, (projectile, target) => {
      const bullet = projectile as Phaser.GameObjects.Rectangle;
      const enemy = target as Phaser.GameObjects.Rectangle;
      if (this.finished || !bullet.active || !enemy.active) return;
      // Recycle before applying damage: this projectile can hit only one target.
      this.recycleBullet(bullet);
      this.damageEnemy(enemy, this.playerStats.attack);
    });
    const stopBullet: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (object) => this.recycleBullet(object as Phaser.GameObjects.Rectangle);
    this.physics.add.collider(this.bullets, ground, stopBullet);
    this.physics.add.collider(this.bullets, upperGround, stopBullet);
    if (stage.boss) {
      this.boss = new MachineBoss(this, stage.boss, this.player, this.bullets, stage.width, {
        isSpeed: () => this.mode === 'SPEED',
        hurt: (x) => { this.takeHit(x); },
        recycle: (bullet) => this.recycleBullet(bullet),
        bulletDamage: this.playerStats.attack,
        contactDamage: Math.round(DASH_CONTACT_DAMAGE * this.playerStats.attack / BULLET_DAMAGE),
        contactCooldown: DASH_ATTACK_COOLDOWN_MS,
        defeated: (x, y) => {
          this.enemyScore += 2000;
          this.updateScore(); this.audio.play('enemy'); this.effects.burst(x, y, 0xffd58a, 12, 180);
          this.endStage(true);
        },
      });
    }
    this.physics.add.collider(this.player, ground);
    this.physics.add.collider(this.player, upperGround, undefined, (_player, block) => {
      const body = (block as Phaser.GameObjects.Rectangle).body as Phaser.Physics.Arcade.StaticBody;
      return this.body.velocity.y >= 0 && this.body.prev.y + this.body.height <= body.top + 6;
    });
    const checkpoints = stage.checkpoints ?? [stage.checkpoint];
    checkpoints.forEach((point, index) => {
      const pole = this.add.rectangle(point.x, point.y - 20, 8, 100, CHECKPOINT_INACTIVE);
      const flag = this.add.triangle(point.x + 23, point.y - 54, 0, 0, 38, 14, 0, 28, CHECKPOINT_INACTIVE);
      this.add.text(point.x - 50, point.y - 94, 'CHECKPOINT', { fontSize: '13px', color: '#bad0e4' });
      this.physics.add.existing(pole, true);
      this.physics.add.overlap(this.player, pole, () => {
        if (this.finished || this.bossTest || index <= this.lastCheckpoint) return;
        this.lastCheckpoint = index;
        this.checkpointActive = true;
        this.respawnPoint = point;
        pole.setFillStyle(CHECKPOINT_ACTIVE);
        flag.setFillStyle(CHECKPOINT_ACTIVE);
        status.textContent = '체크포인트 활성화! 다음 부활은 이곳에서';
      });
    });
    const rewards = this.physics.add.staticGroup();
    stage.rewards?.forEach((reward) => {
      const star = this.add.rectangle(reward.x, reward.y, 30, 30, 0xffd578);
      this.physics.add.existing(star, true);
      star.setData('score', reward.score);
      rewards.add(star);
      this.attachVisual(star, 'reward-star', 38, 38);
    });
    this.physics.add.overlap(this.player, rewards, (_player, object) => {
      const reward = object as Phaser.GameObjects.Rectangle;
      if (this.finished || !reward.active) return;
      reward.setActive(false).setVisible(false);
      (reward.body as Phaser.Physics.Arcade.StaticBody).enable = false;
      this.enemyScore += reward.getData('score') as number;
      this.updateScore();
      this.audio.play('coin');
      this.effects.burst(reward.x, reward.y, 0xffd578, 12, 150);
      status.textContent = `숨겨진 보상! +${reward.getData('score')}점`;
    });
    this.physics.add.overlap(this.player, hazards, (_player, spike) => {
      const trap = spike as Phaser.GameObjects.Triangle;
      if (this.takeHit(trap.x)) this.flashTerrain(trap);
    });
    this.physics.add.overlap(this.player, this.coins, (_player, coin) => {
      const collectible = coin as Phaser.GameObjects.Arc;
      if (this.finished || !collectible.active) return;
      collectible.setActive(false).setVisible(false);
      (collectible.body as Phaser.Physics.Arcade.StaticBody).enable = false;
      this.coinCount += 1;
      this.audio.play('coin');
      this.effects.burst(collectible.x, collectible.y, 0xffe18a, 8);
      this.updateScore();
    });
    this.physics.add.overlap(this.player, goal, () => {
      if (!this.boss || this.boss.defeated) this.endStage(true);
    });
    if (this.boss) this.add.text(goalX - 70, 285, '보스를 처치하면 클리어', { fontSize: '13px', color: '#ffc1a0' });
    this.cameras.main.setBounds(0, 0, stage.width, 600);
    this.cameras.main.startFollow(this.player, true, 1, 1, 0, 0);
    this.cameras.main.centerOn(spawn.x, spawn.y);
    this.keys = this.input.keyboard!.addKeys('LEFT,RIGHT,UP,A,D,W,SPACE,TAB') as Record<string, Phaser.Input.Keyboard.Key>;
    // Cancel browser button activation only after Phaser has received the key.
    // Preventing it in DOM capture makes KeyboardManager discard the input.
    const preventSpaceClick = (event: KeyboardEvent) => event.preventDefault();
    this.input.keyboard!.on('keydown-SPACE', preventSpaceClick);
    this.input.keyboard!.on('keyup-SPACE', preventSpaceClick);
    this.input.keyboard!.on('keydown-TAB', (event: KeyboardEvent) => {
      event.preventDefault();
      if (!event.repeat && !this.finished) modeToggleCount += 1;
    });
    this.input.keyboard!.on('keyup-TAB', preventSpaceClick);
    this.game.events.on(Phaser.Core.Events.BLUR, this.resetInput, this);
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncVisuals, this);
    const unbindEnvironment = bindAppEnvironment(this, () => this.resetInput(), () => this.audio.pauseForBackground(), () => this.audio.resumeFromBackground());
    installPerformanceDiagnostics(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unbindEnvironment();
      this.game.events.off(Phaser.Core.Events.BLUR, this.resetInput, this);
      this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.syncVisuals, this);
      this.resultTimer?.remove(false);
      this.audio.destroy();
      this.effects.destroy();
      this.boss?.destroy();
      nextButton.onclick = null;
      for (const id of ['restart', 'result-restart', 'lobby', 'result-lobby', 'boss-test']) document.querySelector<HTMLButtonElement>(`#${id}`)!.onclick = null;
      result.hidden = true;
    });
    document.querySelector<HTMLButtonElement>('#restart')!.onclick = () => this.restartGame();
    document.querySelector<HTMLButtonElement>('#result-restart')!.onclick = () => this.restartGame(this.hp === 0 || this.bossTest);
    document.querySelector<HTMLButtonElement>('#boss-test')!.onclick = () => {
      this.resetInput(); this.finished = true; result.hidden = true;
      this.scene.restart({ stageIndex: 2, bossTest: true });
    };
    const returnToLobby = () => {
      this.resetInput(); this.finished = true; result.hidden = true;
      this.scene.start('MainMenuScene');
    };
    document.querySelector<HTMLButtonElement>('#lobby')!.onclick = returnToLobby;
    document.querySelector<HTMLButtonElement>('#result-lobby')!.onclick = returnToLobby;
    nextButton.onclick = () => {
      if (!this.finished || this.bossTest || this.hp <= 0 || this.stageIndex >= STAGES.length - 1) return;
      this.resetInput();
      this.finished = false;
      result.hidden = true;
      this.scene.restart({ stageIndex: this.stageIndex + 1, hp: this.hp, coinCount: this.coinCount, enemyScore: this.enemyScore });
    };
  }

  private attachVisual(source: Phaser.GameObjects.Shape, key: string, width: number, height: number, offsetY = 0, flip = false) {
    source.fillAlpha = 0;
    source.strokeAlpha = 0;
    source.isFilled = false;
    source.isStroked = false;
    const sprite = this.add.sprite(source.x, source.y + offsetY, key).setDisplaySize(width, height).setDepth(2);
    this.visuals.push({ source, sprite, offsetY, flip, isStatic: source.body instanceof Phaser.Physics.Arcade.StaticBody, scaleX: sprite.scaleX, scaleY: sprite.scaleY });
    return sprite;
  }

  private syncVisuals(_time: number, delta: number) {
    this.effects.update(delta);
    const view = this.cameras.main.worldView;
    for (const enemy of this.enemies) {
      enemy.healthBar.update(enemy.body.center.x, enemy.body.top - 11, enemy.sprite.getData('hp') as number, ENEMY_HP,
        enemy.sprite.active && enemy.body.right >= view.left && enemy.body.left <= view.right);
    }
    for (const visual of this.visuals) {
      if (visual.isStatic) {
        visual.sprite.setActive(visual.source.active && visual.source.visible && visual.source.x >= view.left - 96 && visual.source.x <= view.right + 96);
      } else visual.sprite.setPosition(visual.source.x, visual.source.y + visual.offsetY).setAngle(visual.source.angle).setScale(visual.scaleX * visual.source.scaleX, visual.scaleY * visual.source.scaleY);
      visual.sprite.setVisible(visual.source.visible).setAlpha(visual.source.alpha);
      if (visual.flip && visual.source.active) visual.sprite.setFlipX((visual.source.body as Phaser.Physics.Arcade.Body).velocity.x < 0);
    }
    this.playerVisual.setFlipX(this.mode === 'ATTACK' ? this.facing < 0 : Math.abs(this.body.velocity.x) > 8 ? this.body.velocity.x < 0 : this.facing < 0);
    if (this.finished) { this.playerVisual.anims.pause(); return; }
    const grounded = this.body.blocked.down || this.body.touching.down;
    if (grounded && !this.wasGrounded && this.lastVerticalSpeed > 100 && this.body.velocity.y >= 0) this.audio.play('land');
    this.wasGrounded = grounded;
    this.lastVerticalSpeed = this.body.velocity.y;
    const pose: PlayerPose = this.time.now < this.knockbackUntil ? 'hurt'
      : (this.mode === 'SPEED') ? 'dash'
      : this.flying ? 'jump'
      : !grounded && this.body.velocity.y <= 0 ? 'jump'
      : !grounded ? 'fall'
      : Math.abs(this.body.velocity.x) > 8 ? 'run' : 'idle';
    if (pose !== this.playerPose) {
      this.playerPose = pose;
      this.playerVisual.play(`${this.robot.animationPrefix}-${pose}`);
      if (pose === 'dash') this.audio.play('dash');
    }
    // Frame playback rotates only the drawn wheels/shell, never the physics body.
    this.playerVisual.anims.timeScale = pose === 'run'
      ? Phaser.Math.Clamp(Math.abs(this.body.velocity.x) / MOVE_SPEED, 0.1, 2.5)
      : pose === 'dash' ? Phaser.Math.Clamp(Math.abs(this.body.velocity.x) / MOVE_SPEED, 0, 3) : 1;
    if (pose === 'dash' && Math.abs(this.body.velocity.x) > 30) this.effects.trail(this.playerVisual, this.time.now);
    if (this.time.now < this.boostUntil) this.playerVisual.setTint(0xb3fff0);
    else this.playerVisual.clearTint();
  }

  private setMode(mode: 'ATTACK' | 'SPEED') {
    this.mode = mode;
    this.flying = false;
    this.nextShotAt = (this.time?.now ?? 0) + SHOT_INTERVAL_MS;
    modeHud.textContent = mode === 'SPEED' ? '기동모드' : '공격모드';
    modeHud.classList.toggle('active', mode === 'SPEED');
    modeButton.textContent = mode === 'SPEED' ? '기동모드' : '공격모드';
    modeButton.setAttribute('aria-pressed', String(mode === 'ATTACK'));
    modeButton.setAttribute('aria-label', mode === 'SPEED' ? '공격모드로 전환' : '기동모드로 전환');
    jumpButton.textContent = mode === 'ATTACK' ? '날기' : '점프';
    jumpButton.setAttribute('aria-label', mode === 'ATTACK' ? '날기, 공중에서 유지하면 추진기 작동' : '점프');
  }

  private updateEnergyHud() {
    const value = Math.floor(this.energy);
    if (value === this.shownEnergy) return;
    this.shownEnergy = value;
    energyHud.textContent = String(value);
  }

  private resetCombatMode() {
    this.setMode('SPEED');
    this.energy = this.playerStats.maxEnergy;
    this.updateEnergyHud();
    for (const bullet of this.bulletPool) this.recycleBullet(bullet.sprite);
  }

  private recycleBullet(sprite: Phaser.GameObjects.Rectangle) {
    sprite.setActive(false).setVisible(false);
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    body.enable = false;
  }

  private updateBullets() {
    for (const bullet of this.bulletPool) {
      if (bullet.sprite.active && (this.time.now >= bullet.expires || bullet.body.right < 0 || bullet.body.left > STAGES[this.stageIndex].width)) this.recycleBullet(bullet.sprite);
    }
    if (this.mode !== 'ATTACK' || this.time.now < this.nextShotAt || this.time.now < this.knockbackUntil) return;
    const shotY = this.player.y - 6;
    const range = BULLET_SPEED * BULLET_LIFETIME_MS / 1000;
    const hasEnemy = this.enemies.some((enemy) => {
      const distance = (enemy.body.center.x - this.player.x) * this.facing;
      return enemy.sprite.active && enemy.body.enable && distance >= 0 && distance <= range && shotY >= enemy.body.top - 4 && shotY <= enemy.body.bottom + 4;
    });
    if (!hasEnemy && !this.boss?.hasTarget(this.player.x, shotY, this.facing, range)) return;
    this.nextShotAt = this.time.now + SHOT_INTERVAL_MS;
    const bullet = this.bulletPool.find((entry) => !entry.sprite.active);
    if (!bullet) return;
    bullet.sprite.setActive(true).setVisible(true);
    bullet.body.enable = true;
    bullet.body.reset(this.player.x + this.facing * 26, this.player.y - 6);
    bullet.body.setVelocityX(this.facing * BULLET_SPEED);
    bullet.expires = this.time.now + BULLET_LIFETIME_MS;
  }

  private damageEnemy(sprite: Phaser.GameObjects.Rectangle, damage: number) {
    if (!sprite.active) return;
    const hp = Math.max(0, (sprite.getData('hp') as number) - damage);
    sprite.setData('hp', hp);
    if (hp === 0) this.defeatEnemy(sprite);
    else this.effects.burst(sprite.x, sprite.y, 0xffc37a, 4, 75);
  }

  private resetInput() {
    clearControls();
    this.flying = false;
    this.input.keyboard?.resetKeys();
    this.body.setVelocityX(0);
  }

  private restartGame(retryCurrentStage = false) {
    this.resetInput();
    this.finished = true;
    result.hidden = true;
    this.scene.restart({
      stageIndex: retryCurrentStage ? this.stageIndex : 0,
      hp: this.playerStats.maxHp,
      coinCount: retryCurrentStage ? this.stageStartCoins : 0,
      enemyScore: retryCurrentStage ? this.stageStartEnemyScore : 0,
      bossTest: this.bossTest,
    });
  }

  private respawn() {
    if (this.finished) return;
    this.deaths += 1;
    this.boss?.reset();
    this.resetCombatMode();
    const spawn = this.respawnPoint;
    this.resetInput();
    this.body.reset(spawn.x, spawn.y);
    this.body.setVelocity(0, 0);
    this.knockbackUntil = 0;
    this.boostUntil = 0;
    this.invulnerableUntil = this.time.now + INVULNERABLE_MS;
    this.player.setAlpha(1);
    this.effects.clear();
    this.wasGrounded = false;
    this.lastVerticalSpeed = 0;
    this.cameras.main.centerOn(spawn.x, spawn.y);
    status.textContent = `${this.checkpointActive ? '체크포인트' : '시작 지점'}에서 부활 · ${this.deaths}회`;
  }

  private loseHp() {
    if (this.finished || this.time.now < this.invulnerableUntil) return false;
    this.invulnerableUntil = this.time.now + INVULNERABLE_MS;
    this.hp = Math.max(0, Math.round((this.hp - (1 - this.playerStats.defense / 100)) * 100) / 100);
    this.updateScore();
    if (this.hp === 0) this.endStage(false);
    this.audio.play('hurt');
    this.cameras.main.shake(130, 0.004);
    return true;
  }

  private flashTerrain(sprite: Phaser.GameObjects.Shape) {
    this.tweens.killTweensOf(sprite);
    sprite.setAlpha(1);
    this.tweens.add({ targets: sprite, alpha: 0.35, duration: 100, yoyo: true, repeat: 1 });
  }

  private takeHit(sourceX: number) {
    if (!this.loseHp()) return false;
    if (!this.finished) {
      this.knockbackUntil = this.time.now + KNOCKBACK_MS;
      this.body.setVelocity(this.player.x < sourceX ? -KNOCKBACK_SPEED : KNOCKBACK_SPEED, -220);
    }
    return true;
  }

  private hitEnemy(sprite: Phaser.GameObjects.Rectangle) {
    if (this.finished || !sprite.active) return;
    const enemyBody = sprite.body as Phaser.Physics.Arcade.Body;
    const fallingFromAbove = this.body.velocity.y > 0 && this.body.prev.y + this.body.height <= enemyBody.top + 6;
    if (fallingFromAbove) {
      this.defeatEnemy(sprite);
      const velocityX = this.body.velocity.x;
      this.body.reset(this.player.x, enemyBody.top - this.body.halfHeight - 1);
      this.body.setVelocity(velocityX, -STOMP_BOUNCE);
      return;
    }
    if ((this.mode === 'SPEED') && this.time.now >= this.knockbackUntil
      && this.time.now >= (sprite.getData('nextDashAttackAt') as number)) {
      sprite.setData('nextDashAttackAt', this.time.now + DASH_ATTACK_COOLDOWN_MS);
      this.damageEnemy(sprite, Math.round(DASH_CONTACT_DAMAGE * this.playerStats.attack / BULLET_DAMAGE));
    }
    if (!sprite.active) return;
    if (this.time.now >= (sprite.getData('contactReadyAt') as number)) this.takeHit(sprite.x);
  }

  private defeatEnemy(sprite: Phaser.GameObjects.Rectangle) {
    if (!sprite.active) return;
    sprite.setActive(false);
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    body.enable = false;
    body.setVelocity(0, 0);
    this.enemyScore += ENEMY_SCORE;
    this.audio.play('enemy');
    this.effects.burst(sprite.x, sprite.y, 0xe4b6ff, 12, 135);
    this.updateScore();
    this.tweens.killTweensOf(sprite);
    sprite.setAlpha(1);
    const direction = this.player.x < sprite.x ? 1 : -1;
    this.tweens.add({ targets: sprite, x: sprite.x + direction * 44, y: sprite.y - 45, angle: direction * 140, scaleX: 0.2, scaleY: 0.2, alpha: 0, duration: 380, ease: 'Quad.easeIn', onComplete: () => sprite.setVisible(false) });
  }

  private endStage(cleared: boolean) {
    if (this.finished) return;
    if (!cleared) this.boss?.reset();
    this.boss?.halt();
    this.finished = true;
    this.resetInput();
    this.resetCombatMode();
    this.body.setVelocity(0, 0);
    this.player.setAlpha(1);
    this.physics.pause();
    this.audio.stopMusic();
    const allCleared = cleared && this.stageIndex === STAGES.length - 1;
    if (cleared && !this.bossTest) unlockNextStage(this.stageIndex + 1, STAGES.length);
    resultTitle.textContent = cleared ? (allCleared ? 'ALL CLEAR!' : 'STAGE CLEAR!') : 'GAME OVER';
    status.textContent = cleared ? (allCleared ? '전체 스테이지 클리어! 축하합니다' : `Stage ${this.stageIndex + 1} 클리어!`) : 'HP가 모두 소진되었습니다';
    resultStats.textContent = `점수 ${this.coinCount * COIN_SCORE + this.enemyScore}점 · 코인 ${this.coinCount}개`;
    nextButton.hidden = !cleared || allCleared || this.bossTest;
    document.querySelector<HTMLButtonElement>('#result-restart')!.textContent = this.bossTest ? '보스 재도전' : cleared
      ? 'Stage 1부터 다시 시작' : `Stage ${this.stageIndex + 1}에서 부활 (HP ${this.playerStats.maxHp})`;
    const showResult = () => {
      result.hidden = false;
      (nextButton.hidden ? document.querySelector<HTMLButtonElement>('#result-restart')! : nextButton).focus({ preventScroll: true });
    };
    if (cleared) {
      this.cameras.main.zoomTo(1.15, 450, 'Sine.easeOut');
      this.resultTimer = this.time.delayedCall(480, showResult);
    } else showResult();
  }

  update(_time: number, delta: number) {
    const upJump = Phaser.Input.Keyboard.JustDown(this.keys.UP);
    const wJump = Phaser.Input.Keyboard.JustDown(this.keys.W);
    const spaceJump = Phaser.Input.Keyboard.JustDown(this.keys.SPACE);
    const keyboardJump = upJump || wJump || spaceJump;
    const jump = keyboardJump || jumpQueued;
    jumpQueued = false;
    const toggleMode = modeToggleCount % 2 === 1;
    modeToggleCount = 0;
    if (this.finished) return;
    this.boss?.update();
    if (toggleMode) this.setMode(this.mode === 'SPEED' ? 'ATTACK' : 'SPEED');
    for (const platform of this.movingPlatforms) {
      const position = platform.sprite[platform.axis];
      if (position <= platform.min) platform.body.velocity[platform.axis] = PLATFORM_SPEED;
      else if (position >= platform.max) platform.body.velocity[platform.axis] = -PLATFORM_SPEED;
    }
    for (const pad of this.specialPads) {
      const padBody = pad.sprite.body as Phaser.Physics.Arcade.StaticBody;
      if (this.body.right <= padBody.left || this.body.left >= padBody.right || Math.abs(this.body.bottom - padBody.top) > 8) pad.triggered = false;
    }
    this.player.setAlpha(this.time.now < this.invulnerableUntil && Math.floor(this.time.now / 80) % 2 === 0 ? 0.3 : 1);
    const camera = this.cameras.main;
    const sections = STAGES[this.stageIndex].sections;
    if (sections) {
      let sectionIndex = 0;
      for (let i = 1; i < sections.length; i++) if (this.player.x >= sections[i].x) sectionIndex = i;
      if (sectionIndex !== this.currentSection) {
        this.currentSection = sectionIndex;
        status.textContent = `${sections[sectionIndex].title} · ${sections[sectionIndex].hint}`;
      }
    }
    for (const enemy of this.enemies) {
      if (!enemy.sprite.active) continue;
      const { body, sprite, visual } = enemy;
      const visible = Phaser.Geom.Rectangle.Contains(camera.worldView, body.center.x, body.center.y);
      if (this.stageIndex === 0) {
        if (!visible) sprite.setData('contactReadyAt', Infinity);
        else if (sprite.getData('contactReadyAt') === Infinity) sprite.setData('contactReadyAt', this.time.now + 650);
      }
      // Use physics coordinates and reverse only when heading out of bounds.
      // Repeated Body.reset() at an endpoint used to cancel patrol integration.
      if (enemy.kind !== 'charger') {
        if (body.center.x <= enemy.min && body.velocity.x < 0) {
          body.x = enemy.min - body.halfWidth;
          body.setVelocityX(ENEMY_SPEED);
        } else if (body.center.x >= enemy.max && body.velocity.x > 0) {
          body.x = enemy.max - body.halfWidth;
          body.setVelocityX(-ENEMY_SPEED);
        }
        if (enemy.kind === 'fly') {
          const targetY = enemy.baseY + Math.sin(this.time.now / 700 + enemy.min) * 24;
          body.setVelocityY((targetY - body.center.y) * 8);
        }
        continue;
      }
      const distance = this.player.x - body.center.x;
      if (enemy.state === 'idle') {
        body.setVelocityX(0);
        if (visible && this.time.now >= (sprite.getData('contactReadyAt') as number)
          && Math.abs(distance) < Math.min(300, camera.width * 0.65)
          && Math.abs(this.player.y - body.center.y) < 60
          && Math.abs(this.body.velocity.x) < MOVE_SPEED + 30) {
          enemy.direction = Math.sign(distance) || 1;
          enemy.state = 'windup';
          enemy.until = this.time.now + 800;
        }
      } else if (enemy.state === 'windup') {
        body.setVelocityX(0);
        if (this.time.now >= enemy.until) {
          enemy.state = 'charge';
          enemy.until = this.time.now + 650;
        }
      }
      if (enemy.state === 'charge') {
        const atEdge = (body.center.x <= enemy.min && enemy.direction < 0)
          || (body.center.x >= enemy.max && enemy.direction > 0);
        if (atEdge || this.time.now >= enemy.until) {
          enemy.state = 'recover';
          enemy.until = this.time.now + 1200;
          body.setVelocityX(0);
        } else body.setVelocityX(enemy.direction * 210);
      } else if (enemy.state === 'recover' && this.time.now >= enemy.until) enemy.state = 'idle';
      if (enemy.state === 'windup') {
        visual.setTint(0xffa45c);
        sprite.setAlpha(Math.floor(this.time.now / 100) % 2 ? 0.55 : 1);
      } else { visual.clearTint(); sprite.setAlpha(1); }
    }
    const left = this.keys.LEFT.isDown || this.keys.A.isDown || controls.left.size > 0;
    const right = this.keys.RIGHT.isDown || this.keys.D.isDown || controls.right.size > 0;
    const direction = Number(right) - Number(left);
    if (direction !== 0) this.facing = direction;
    const dash = (this.mode === 'SPEED');
    const boosted = this.time.now < this.boostUntil;
    const targetSpeed = direction * (dash ? DASH_SPEED : ATTACK_SPEED) * (boosted ? BOOST_MULTIPLIER : 1);
    const grounded = this.body.blocked.down || this.body.touching.down;
    const acceleration = direction === 0
      ? DECELERATION
      : !grounded ? AIR_ACCELERATION : dash ? DASH_ACCELERATION : MOVE_ACCELERATION;
    const step = acceleration * Math.min(delta, 50) / 1000;
    const difference = targetSpeed - this.body.velocity.x;
    if (this.time.now >= this.knockbackUntil) {
      this.body.setVelocityX(this.body.velocity.x + Phaser.Math.Clamp(difference, -step, step));
      if (jump && grounded && this.body.velocity.y >= 0) {
        this.body.setVelocityY(-JUMP_SPEED);
        this.audio.play('jump');
      }
    }
    const seconds = Math.max(0, delta) / 1000;
    const jumpHeld = this.keys.SPACE.isDown || this.keys.UP.isDown || this.keys.W.isDown || controls.jump.size > 0;
    this.flying = this.mode === 'ATTACK' && !grounded && jumpHeld && this.energy > 0 && this.time.now >= this.knockbackUntil;
    if (this.flying) {
      this.energy = Math.max(0, this.energy - FLIGHT_COST_PER_SECOND * seconds);
      if (this.energy === 0) this.flying = false;
      else {
        // Keep the existing jump/spring impulse; thrust takes over as it slows.
        if (this.body.velocity.y > -FLIGHT_SPEED) this.body.setVelocityY(Math.max(-FLIGHT_SPEED, this.body.velocity.y - FLIGHT_THRUST * seconds));
        if (this.body.top < 8 && this.body.velocity.y < 0) { this.body.y = 8; this.body.setVelocityY(0); }
        if (this.time.now >= this.nextThrusterAt) {
          this.nextThrusterAt = this.time.now + 90;
          this.effects.burst(this.player.x, this.player.y + 18, 0xffba6c, 2, 35);
        }
      }
    } else if (this.mode === 'SPEED' && grounded && Math.abs(this.body.velocity.x) > 8 && this.time.now >= this.knockbackUntil) {
      this.energy = Math.min(this.playerStats.maxEnergy, this.energy + ENERGY_REGEN_PER_SECOND * seconds);
    }
    this.updateEnergyHud();
    this.updateBullets();
    if (this.player.x < 15) {
      this.player.x = 15;
      this.body.setVelocityX(Math.max(0, this.body.velocity.x));
    }
    if (this.player.y > 720) {
      this.loseHp();
      if (!this.finished) this.respawn();
    }
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#101d32',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: Math.max(1, Math.round(window.innerWidth / window.innerHeight * 600)),
    height: 600,
  },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 1100 } } },
  audio: { noAudio: true },
  scene: [MainMenuScene, MenuScreenScene, GameScene],
});
game.events.once(Phaser.Core.Events.DESTROY, closeAudio);

const resize = () => {
  const parent = document.querySelector<HTMLElement>('#game')!;
  game.scale.setGameSize(Math.max(1, Math.round(parent.clientWidth / Math.max(1, parent.clientHeight) * 600)), 600);
};
const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(document.querySelector('#game')!);
game.events.once(Phaser.Core.Events.DESTROY, () => resizeObserver.disconnect());
