import Phaser from 'phaser';
import { STAGES, type PadKind, type StageData } from '../stages';
import { createPropArt, PROP_KEYS, COIN_FRAMES, SIGN_SLICE } from '../graphics/props-art';
import { createEnemyArt } from '../graphics/enemy-art';
import { artScale } from '../graphics/art';
import { DEPTH } from '../graphics/depth';
import { addLabel } from '../graphics/display';
import { themeForStage, type StageTheme } from '../graphics/themes';
import { createSceneryArt } from '../graphics/scenery-art';
import { Parallax } from '../graphics/parallax';
import { buildTerrain, toRect } from '../graphics/terrain';
import { GameAudio } from '../audio';
import { GameEffects } from '../effects';
import { bindAppEnvironment } from '../app-environment';
import { installPerformanceDiagnostics } from '../performance';
import { installFpsWatchdog } from '../graphics/fps-watchdog';
import { addCurrency, getEquippedRobot, getPlayerProgress, spendCurrency, unlockNextStage } from '../progress';
import { showRewardedAd } from '../ads';
import { COMBAT, ECONOMY, GIMMICK, PHYSICS } from './config';
import { clearReward, reviveOffer } from './economy';
import { classifyContact, createContactBox, type ContactRules } from './contact';
import { InputController, type Control, type InputFrame } from './input';
import { Player } from './player';
import { RobotRig } from '../graphics/robot-rig';
import { createRobotArt } from '../graphics/robot-art';
import { RENDER_SCALE_EVENT } from '../graphics/display';
import { EnemySystem, type EnemyConfig } from './enemies';
import { VisualSync } from './visual-sync';
import { Hud } from './hud';
import { CameraController } from './camera';
import { PadSystem } from './mechanics/pads';
import { MovingPlatforms } from './mechanics/moving-platforms';
import { SwingRope } from './mechanics/swing-rope';
import { BreakableWalls } from './mechanics/breakable-walls';
import { MachineBoss, type BossRecoil } from './boss';
import { installDebugHooks } from './debug';

const START = { x: 90, y: 440 };
const CRYSTAL_IDLE_TINT = 0x8fa3b8;
const FLOOR_TOP = 480;
const WALL_HIT_STOP_MS = 40;
const RULES: ContactRules = {
  stompTolerance: COMBAT.stompTolerance, minStompSpeed: COMBAT.minStompSpeed,
  minClosingSpeed: COMBAT.minClosingSpeed, rollExitSpeed: PHYSICS.rollExitSpeed,
};

type SceneData = { stageIndex?: number; hp?: number; coinCount?: number; enemyScore?: number };

// Stage orchestration: builds the level, routes contacts to the rule modules and owns HP/score.
export class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }
  private playerStats = getPlayerProgress().stats;
  private robot = getEquippedRobot();
  private stageIndex = 0;
  private hp = 3;
  private coinCount = 0;
  private enemyScore = 0;
  private stageStartCoins = 0;
  private stageStartEnemyScore = 0;
  private finished = false;
  private deaths = 0;
  private checkpointActive = false;
  private lastCheckpoint = -1;
  private respawnPoint = START;
  private currentSection = -1;
  private hitStopUntil = 0;
  private resultTimer?: Phaser.Time.TimerEvent;
  private reward = 0;
  private rewardDoubled = false;
  private adOpen = false;
  private frameInput: InputFrame = { direction: 0, jumpPressed: false, jumpHeld: false, dash: 0 };
  private targetBox = createContactBox();
  private hud!: Hud;
  private controls!: InputController;
  private audio!: GameAudio;
  private effects!: GameEffects;
  private visuals!: VisualSync;
  private player!: Player;
  private rig!: RobotRig;
  private cameraControl!: CameraController;
  private wasRolling = false;
  private stepDistance = 0;
  // Floor tops for the contact shadow (solid and one-way platforms).
  private surfaces: { left: number; right: number; top: number }[] = [];
  private enemies!: EnemySystem;
  private pads!: PadSystem;
  private platforms!: MovingPlatforms;
  private ropes: SwingRope[] = [];
  private boss?: MachineBoss;
  private theme!: StageTheme;

  init(data: SceneData = {}) {
    this.playerStats = getPlayerProgress().stats;
    this.robot = getEquippedRobot();
    this.stageIndex = Phaser.Math.Clamp(Math.floor(data.stageIndex ?? 0), 0, Math.min(STAGES.length, getPlayerProgress().unlockedStage) - 1);
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
    this.hitStopUntil = 0;
    this.resultTimer = undefined;
    this.reward = 0;
    this.rewardDoubled = false;
    this.adOpen = false;
    this.ropes = [];
    this.boss = undefined;
  }

  create() {
    document.body.dataset.screen = document.documentElement.dataset.screen = 'game';
    createRobotArt(this);
    createPropArt(this);
    createEnemyArt(this);
    const stage = STAGES[this.stageIndex];
    const spawn = START;
    this.hud = new Hud();
    this.hud.hideResult();
    this.audio = new GameAudio(stage.theme);
    this.effects = new GameEffects(this);
    this.visuals = new VisualSync(this);
    this.controls = new InputController(this);
    const theme = this.theme = themeForStage(stage.theme);
    document.body.style.setProperty('--accent', theme.accent);
    this.cameras.main.setBackgroundColor(theme.sky[0]);
    document.body.dataset.theme = String(stage.theme);
    this.hud.setStage(this.stageIndex, STAGES.length);
    this.hud.setStatus(`${stage.name} · ← → 이동 · 점프 · 두 번 톡톡 스핀 대시`);
    this.physics.resume();
    this.physics.world.setBounds(0, -200, stage.width, 1100);
    const { solid, oneWay } = this.buildTerrain(stage);

    this.player = new Player(this, spawn.x, spawn.y);
    this.rig = new RobotRig(this, spawn.x, spawn.y + 21);
    this.wasRolling = false;
    this.surfaces = [...stage.platforms, ...(stage.oneWayPlatforms ?? [])]
      .map(([x, y, width, height]) => ({ left: x - width / 2, right: x + width / 2, top: y - height / 2 }));
    this.physics.add.collider(this.player.sprite, solid);
    this.physics.add.collider(this.player.sprite, oneWay, undefined, (_player, block) => {
      const body = (block as Phaser.GameObjects.Rectangle).body as Phaser.Physics.Arcade.StaticBody;
      return !this.player.held && this.player.body.velocity.y >= 0 && this.player.body.prev.y + this.player.body.height <= body.top + 6;
    });
    this.buildPickups(stage);
    this.pads = new PadSystem(this, stage.pads, this.visuals, this.player, (kind, x, y) => this.onPad(kind, x, y));
    this.platforms = new MovingPlatforms(this, stage.movingPlatforms, this.visuals, this.player);
    this.ropes = (stage.ropes ?? []).map((config) => new SwingRope(this, config));
    new BreakableWalls(this, stage.walls ?? [], this.visuals, this.player, RULES, (x, y) => this.onWallBreak(x, y));
    const enemyConfigs: EnemyConfig[] = [
      ...stage.enemies.map(([min, max]): EnemyConfig => ({ kind: 'patrol', x: min, y: 462, min, max })),
      ...(stage.enemyDetails ?? []),
    ];
    this.enemies = new EnemySystem(this, enemyConfigs, this.stageIndex === 0);
    this.physics.add.overlap(this.player.sprite, this.enemies.group, (_player, object) => this.touchEnemy(object));
    if (stage.boss) this.createBoss(stage);

    this.cameraControl = new CameraController(this.cameras.main, this.player.sprite, stage.width);
    this.cameraControl.follow(spawn.x, spawn.y);
    const onRenderScale = () => this.cameraControl.apply();
    this.game.events.on(RENDER_SCALE_EVENT, onRenderScale);
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.render, this);
    const unbindEnvironment = bindAppEnvironment(this, () => this.resetInput(), () => this.audio.pauseForBackground(), () => this.audio.resumeFromBackground());
    installPerformanceDiagnostics(this);
    installFpsWatchdog(this);
    installDebugHooks(this, {
      scene: this,
      state: () => this.debugState(),
      press: (control: Control) => this.controls.press(control, -1),
      release: (control: Control) => this.controls.release(control, -1),
      teleport: (x: number, y: number) => { this.detachRopes(); this.player.respawn(x, y, this.time.now); },
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unbindEnvironment();
      this.game.events.off(RENDER_SCALE_EVENT, onRenderScale);
      this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.render, this);
      this.resultTimer?.remove(false);
      this.controls.destroy();
      this.audio.destroy();
      this.effects.destroy();
      this.boss?.destroy();
      this.hud.nextButton.onclick = null;
      for (const id of ['restart', 'result-restart', 'lobby', 'result-lobby', 'result-double', 'revive-ad', 'revive-coins', 'revive-skip']) document.querySelector<HTMLButtonElement>(`#${id}`)!.onclick = null;
      this.hud.hideResult();
    });
    this.bindButtons();
  }

  private buildTerrain(stage: StageData) {
    const theme = this.theme;
    createSceneryArt(this, theme);
    new Parallax(this, theme);
    const solid = this.physics.add.staticGroup();
    const oneWay = this.physics.add.staticGroup();
    const block = ([x, y, width, height]: [number, number, number, number], group: Phaser.Physics.Arcade.StaticGroup) => {
      const rect = this.add.rectangle(x, y, width, height, 0x000000, 0).setVisible(false);
      this.physics.add.existing(rect, true);
      group.add(rect);
    };
    stage.platforms.forEach((platform) => block(platform, solid));
    stage.oneWayPlatforms?.forEach((platform) => block(platform, oneWay));
    const avoid = [...stage.spikes, ...(stage.traps ?? []).map(([x]) => x), ...stage.pads.map(([x]) => x), ...(stage.walls ?? []).map((wall) => wall.x)];
    buildTerrain(this, theme, stage.platforms.map(toRect), (stage.oneWayPlatforms ?? []).map(toRect), avoid);
    stage.signs?.forEach((sign) => this.addSign(sign.x, sign.y, sign.text));
    return { solid, oneWay };
  }

  private addSign(x: number, y: number, text: string) {
    const label = addLabel(this, x, y, text, { fontSize: '14px', fontStyle: 'bold', color: '#FFF4DC', stroke: '#5A3418', strokeThickness: 3 }).setOrigin(0.5).setDepth(DEPTH.prop + 0.2);
    const scale = artScale(PROP_KEYS.sign);
    const board = this.add.nineslice(x, y, PROP_KEYS.sign, undefined, (label.width + 26) * scale, (label.height + 14) * scale, SIGN_SLICE * scale, SIGN_SLICE * scale, SIGN_SLICE * scale, SIGN_SLICE * scale)
      .setScale(1 / scale).setDepth(DEPTH.prop + 0.1);
    const postTop = y + board.displayHeight / 2 - 4;
    if (postTop < FLOOR_TOP) {
      this.add.image(x, postTop, PROP_KEYS.post).setOrigin(0.5, 0).setDepth(DEPTH.prop).setDisplaySize(8, FLOOR_TOP - postTop + 2);
    }
  }

  private buildPickups(stage: StageData) {
    const coins = this.physics.add.staticGroup();
    stage.coins.forEach(([x, y], index) => {
      const coin = this.add.circle(x, y, 11, 0xffd35a);
      this.physics.add.existing(coin, true);
      coins.add(coin);
      this.visuals.attach(coin, PROP_KEYS.coin(0), 28, 28).setDepth(DEPTH.pickup).play({ key: PROP_KEYS.coinSpin, startFrame: index % COIN_FRAMES });
    });
    this.updateScore();
    this.physics.add.overlap(this.player.sprite, coins, (_player, object) => {
      const coin = object as Phaser.GameObjects.Arc;
      if (this.finished || !coin.active) return;
      coin.setActive(false).setVisible(false);
      (coin.body as Phaser.Physics.Arcade.StaticBody).enable = false;
      this.coinCount += 1;
      this.rig.event('happy');
      this.audio.play('coin');
      this.effects.coin(coin.x, coin.y);
      this.updateScore();
    });

    const hazards = this.physics.add.staticGroup();
    const traps: [number, number][] = [...stage.spikes.map((x): [number, number] => [x, 465]), ...(stage.traps ?? [])];
    for (const [x, y] of traps) {
      const spike = this.add.triangle(x, y, 0, 30, 18, 0, 36, 30, 0xff6f80);
      this.physics.add.existing(spike, true);
      hazards.add(spike);
      (spike.body as Phaser.Physics.Arcade.StaticBody).setSize(24, 24).setOffset(6, 6);
      this.visuals.attach(spike, PROP_KEYS.spike, 36, 30).setDepth(DEPTH.prop);
    }
    this.physics.add.overlap(this.player.sprite, hazards, (_player, object) => {
      const spike = object as Phaser.GameObjects.Triangle;
      if (this.takeHit(spike.x)) this.flashTerrain(spike);
    });

    const rewards = this.physics.add.staticGroup();
    stage.rewards?.forEach((reward) => {
      const star = this.add.rectangle(reward.x, reward.y, 30, 30, 0xffd578);
      this.physics.add.existing(star, true);
      star.setData('score', reward.score);
      rewards.add(star);
      const visual = this.visuals.attach(star, PROP_KEYS.star, 40, 42).setDepth(DEPTH.pickup);
      this.tweens.add({ targets: visual, y: reward.y - 5, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });
    this.physics.add.overlap(this.player.sprite, rewards, (_player, object) => {
      const reward = object as Phaser.GameObjects.Rectangle;
      if (this.finished || !reward.active) return;
      reward.setActive(false).setVisible(false);
      (reward.body as Phaser.Physics.Arcade.StaticBody).enable = false;
      this.enemyScore += reward.getData('score') as number;
      this.updateScore();
      this.audio.play('coin');
      this.effects.reward(reward.x, reward.y);
      this.rig.event('happy');
      this.hud.setStatus(`숨겨진 보상! +${reward.getData('score')}점`);
    });

    const checkpoints = stage.checkpoints ?? [stage.checkpoint];
    checkpoints.forEach((point, index) => {
      const floor = point.y + 30;
      const pole = this.add.rectangle(point.x, point.y - 20, 8, 100, 0x000000, 0);
      this.add.image(point.x, floor + 2, PROP_KEYS.checkpointBase).setOrigin(0.5, 1).setDepth(DEPTH.prop).setScale(1 / artScale(PROP_KEYS.checkpointBase));
      const crystal = this.add.image(point.x, floor - 24, PROP_KEYS.crystal).setOrigin(0.5, 1).setDepth(DEPTH.prop + 0.1)
        .setScale(1 / artScale(PROP_KEYS.crystal)).setTint(CRYSTAL_IDLE_TINT);
      this.tweens.add({ targets: crystal, y: floor - 28, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.physics.add.existing(pole, true);
      this.physics.add.overlap(this.player.sprite, pole, () => {
        if (this.finished || index <= this.lastCheckpoint) return;
        this.lastCheckpoint = index;
        this.checkpointActive = true;
        this.respawnPoint = point;
        crystal.clearTint();
        this.effects.checkpoint(point.x, floor - 40);
        this.audio.play('grab');
        this.hud.setStatus('체크포인트 활성화! 다음 부활은 이곳에서');
      });
    });

    const goalX = stage.width - 130;
    const goalY = stage.goalY ?? 420;
    const goalFloor = goalY + 60;
    const portal = this.add.image(goalX, goalFloor - 4, PROP_KEYS.portal).setOrigin(0.5, 1).setDepth(DEPTH.prop - 0.1).setScale(1 / artScale(PROP_KEYS.portal));
    this.tweens.add({ targets: portal, alpha: 0.55, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.add.image(goalX, goalFloor + 2, PROP_KEYS.goal).setOrigin(0.5, 1).setDepth(DEPTH.prop).setScale(1 / artScale(PROP_KEYS.goal));
    const goal = this.add.rectangle(goalX, goalY, 44, 120, 0x60dfb1, 0);
    this.physics.add.existing(goal, true);
    this.physics.add.overlap(this.player.sprite, goal, () => {
      if (!this.boss || this.boss.defeated) this.endStage(true);
    });
    if (stage.boss) this.addSign(goalX - 10, goalFloor - 190, '보스를 처치하면 클리어');
  }

  private createBoss(stage: StageData) {
    this.boss = new MachineBoss(this, stage.boss!, this.player.sprite, this.effects, {
      contact: (body) => classifyContact(this.player.contactBox(), this.player.rolling, this.toBox(body), RULES),
      hurt: (x) => { this.takeHit(x); },
      recoil: (x, kind) => this.bossRecoil(x, kind),
      struck: (x, y) => {
        this.audio.play('boss-hit');
        this.effects.bigImpact(x, y);
        this.cameras.main.shake(110, 0.005);
        this.hitStop(COMBAT.bossHitStopMs);
      },
      minionDown: (x, y) => {
        this.enemyScore += COMBAT.enemyScore;
        this.updateScore();
        this.audio.play('enemy');
        this.effects.impact(x, y, 0x94dcca);
        this.effects.popup(x, y - 26, `+${COMBAT.enemyScore}`);
      },
      defeated: (x, y) => {
        this.enemyScore += COMBAT.bossScore;
        this.updateScore(); this.audio.play('enemy'); this.effects.bigImpact(x, y); this.effects.popup(x, y - 60, `+${COMBAT.bossScore}`);
        this.endStage(true);
      },
      damagePerHit: this.playerStats.attack,
      frameArena: (left, right, ground) => this.cameraControl.frameArena(left, right, ground),
      releaseCamera: () => this.cameraControl.release(this.player.x, this.player.y),
    });
  }

  private bindButtons() {
    const button = (id: string) => document.querySelector<HTMLButtonElement>(`#${id}`)!;
    button('restart').onclick = () => this.restartGame();
    button('result-restart').onclick = () => this.restartGame(this.hp === 0);
    const returnToLobby = () => {
      this.resetInput(); this.finished = true; this.hud.hideResult();
      this.scene.start('MainMenuScene');
    };
    button('lobby').onclick = returnToLobby;
    button('result-lobby').onclick = returnToLobby;
    this.hud.doubleButton.onclick = () => { void this.doubleReward(); };
    this.hud.reviveAdButton.onclick = () => { void this.reviveWithAd(); };
    this.hud.reviveCoinButton.onclick = () => { if (!this.adOpen && spendCurrency(ECONOMY.reviveCost)) this.revive(); };
    this.hud.reviveSkipButton.onclick = () => { if (!this.adOpen) this.showGameOver(); };
    this.hud.nextButton.onclick = () => {
      if (!this.finished || this.hp <= 0 || this.stageIndex >= STAGES.length - 1) return;
      this.resetInput();
      this.hud.hideResult();
      this.scene.restart({ stageIndex: this.stageIndex + 1, hp: this.hp, coinCount: this.coinCount, enemyScore: this.enemyScore });
    };
  }

  private toBox(body: Phaser.Physics.Arcade.Body) {
    const box = this.targetBox;
    box.x = body.x; box.y = body.y; box.prevX = body.prev.x; box.prevY = body.prev.y;
    box.width = body.width; box.height = body.height; box.vx = body.velocity.x; box.vy = body.velocity.y;
    return box;
  }

  private touchEnemy(object: unknown) {
    const enemy = this.enemies.find(object);
    if (!enemy || this.finished || this.player.dead) return;
    const now = this.time.now;
    const contact = classifyContact(this.player.contactBox(), this.player.rolling, this.toBox(enemy.body), RULES);
    if (contact === 'touch') {
      if (this.enemies.canHurt(enemy, now)) this.takeHit(enemy.body.center.x);
      return;
    }
    const { x, y } = enemy.body.center;
    const result = this.enemies.damage(enemy, this.playerStats.attack, this.player.x, now);
    if (result === 'ignored') return;
    if (contact === 'stomp') this.player.stompBounce(now, this.frameInput.jumpHeld);
    else if (result === 'hit') this.player.recoil(now, x);
    this.audio.play(contact === 'stomp' ? 'stomp' : 'enemy');
    this.effects.impact(x, y, contact === 'stomp' ? 0xfff0b0 : 0xe4b6ff);
    if (result === 'defeated') {
      this.rig.event('happy');
      this.effects.popup(x, y - 28, `+${COMBAT.enemyScore}`);
      this.enemyScore += COMBAT.enemyScore;
      this.updateScore();
      this.hitStop(COMBAT.hitStopMs);
    }
  }

  private bossRecoil(x: number, kind: BossRecoil) {
    const now = this.time.now;
    if (kind === 'stomp' || kind === 'clang-top') this.player.stompBounce(now, this.frameInput.jumpHeld);
    else if (kind === 'push') this.player.recoil(now, x, 180, 160);
    else this.player.recoil(now, x, 260, 260);
    if (kind === 'clang' || kind === 'clang-top') {
      this.audio.play('clang');
      this.effects.burst(this.player.x + (x > this.player.x ? 16 : -16), this.player.y, 0xfff0c8, 8, 150);
    }
  }

  private onPad(kind: PadKind, x: number, y: number) {
    const now = this.time.now;
    if (kind === 'boost') {
      this.player.boost(now);
      this.audio.play('boost');
      this.effects.boostEntry(this.player.x, this.player.y);
      return;
    }
    const direction = kind === 'spring-right' ? 1 : kind === 'spring-left' ? -1 : 0;
    this.player.launch(now, direction ? direction * GIMMICK.springDiagonalX : undefined, -(direction ? GIMMICK.springDiagonalY : GIMMICK.springSpeed));
    this.audio.play('spring');
    this.rig.event('spring');
    this.effects.spring(x, y - 8);
  }

  private onWallBreak(x: number, y: number) {
    this.audio.play('break');
    this.effects.wallBreak(x, y);
    this.cameras.main.shake(100, 0.004);
    this.hitStop(WALL_HIT_STOP_MS);
    this.hud.setStatus('벽을 부쉈다! 숨겨진 길');
  }

  // A few frames of frozen physics sell the impact; resumed in update().
  private hitStop(ms: number) {
    if (this.finished) return;
    this.hitStopUntil = Math.max(this.hitStopUntil, this.time.now + ms);
    this.physics.world.pause();
  }

  private updateScore() {
    this.hud.setScore(this.coinCount * COMBAT.coinScore + this.enemyScore, this.coinCount);
    this.hud.setHp(this.hp, this.playerStats.maxHp);
  }

  private resetInput() {
    this.controls?.reset();
    this.frameInput.direction = this.frameInput.dash = 0;
    this.frameInput.jumpHeld = this.frameInput.jumpPressed = false;
  }

  private detachRopes() {
    for (const rope of this.ropes) rope.detach(this.player, this.time.now);
  }

  private restartGame(retryCurrentStage = false) {
    this.resetInput();
    this.finished = true;
    this.hud.hideResult();
    this.scene.restart({
      stageIndex: retryCurrentStage ? this.stageIndex : 0,
      hp: this.playerStats.maxHp,
      coinCount: retryCurrentStage ? this.stageStartCoins : 0,
      enemyScore: retryCurrentStage ? this.stageStartEnemyScore : 0,
    });
  }

  private respawn() {
    if (this.finished) return;
    const now = this.time.now;
    this.deaths += 1;
    this.boss?.reset();
    this.detachRopes();
    this.ropes.forEach((rope) => rope.reset());
    this.resetInput();
    const spawn = this.respawnPoint;
    this.player.respawn(spawn.x, spawn.y, now);
    this.rig.reset();
    this.wasRolling = false;
    this.effects.clear();
    this.cameraControl.release(spawn.x, spawn.y);
    this.cameraControl.snap(spawn.x, spawn.y, 1);
    this.hud.setStatus(`${this.checkpointActive ? '체크포인트' : '시작 지점'}에서 부활 · ${this.deaths}회`);
  }

  private loseHp() {
    const now = this.time.now;
    if (this.finished || this.player.isInvulnerable(now)) return false;
    this.player.invulnerableUntil = now + COMBAT.invulnerableMs;
    this.hp = Math.max(0, Math.round((this.hp - (1 - this.playerStats.defense / 100)) * 100) / 100);
    this.updateScore();
    this.audio.play('hurt');
    this.cameras.main.shake(130, 0.004);
    if (this.hp === 0) this.endStage(false);
    return true;
  }

  private takeHit(sourceX: number) {
    if (!this.loseHp()) return false;
    if (!this.finished) {
      this.detachRopes();
      this.player.knockback(this.time.now, sourceX);
      this.rig.event('hurt');
    }
    return true;
  }

  private flashTerrain(sprite: Phaser.GameObjects.Shape) {
    this.tweens.killTweensOf(sprite);
    sprite.setAlpha(1);
    this.tweens.add({ targets: sprite, alpha: 0.35, duration: 100, yoyo: true, repeat: 1 });
  }

  private endStage(cleared: boolean) {
    if (this.finished) return;
    if (!cleared) this.boss?.reset();
    this.boss?.halt();
    this.finished = true;
    this.hitStopUntil = 0;
    this.resetInput();
    this.detachRopes();
    if (cleared) this.player.stop();
    else this.player.die();
    this.physics.pause();
    this.audio.stopMusic();
    this.audio.play(cleared ? 'clear' : 'death');
    const allCleared = cleared && this.stageIndex === STAGES.length - 1;
    if (cleared) unlockNextStage(this.stageIndex + 1, STAGES.length);
    this.hud.setStatus(cleared ? (allCleared ? '전체 스테이지 클리어! 축하합니다' : `Stage ${this.stageIndex + 1} 클리어!`) : 'HP가 모두 소진되었습니다');
    if (cleared) {
      this.reward = clearReward(this.coinCount - this.stageStartCoins, ECONOMY);
      addCurrency(this.reward);
      this.cameraControl.celebrate(this);
      this.effects.confetti(this.player.x, this.player.y - 20);
      this.resultTimer = this.time.delayedCall(480, () => {
        this.hud.showResult('clear', allCleared ? 'ALL CLEAR!' : 'STAGE CLEAR!', this.totalScore(), this.coinCount, !allCleared, '처음부터 다시 시작');
        this.hud.setReward(this.reward);
      });
      return;
    }
    this.effects.burst(this.player.x, this.player.y, 0xd7dde0, 12, 120);
    // A revive restarts from the last checkpoint, so without one there is nothing to offer.
    const offer = reviveOffer(this.checkpointActive, getPlayerProgress().currency, ECONOMY);
    this.resultTimer = this.time.delayedCall(650, () => {
      if (offer.offered) this.hud.showRevive(offer.cost, getPlayerProgress().currency);
      else this.showGameOver();
    });
  }

  private totalScore() { return this.coinCount * COMBAT.coinScore + this.enemyScore; }

  private showGameOver() {
    this.hud.hideResult();
    this.hud.showResult('over', 'GAME OVER', this.totalScore(), this.coinCount, false, `Stage ${this.stageIndex + 1} 다시 시작`);
    this.hud.setReward(null);
  }

  // Back at the last checkpoint with full HP; score and coins of this run are kept.
  private revive() {
    if (!this.finished || this.hp > 0) return;
    this.resultTimer?.remove(false);
    this.hud.hideResult();
    this.finished = false;
    this.hp = this.playerStats.maxHp;
    this.updateScore();
    this.physics.resume();
    this.audio.resumeMusic();
    this.respawn();
  }

  private async reviveWithAd() {
    if (this.adOpen) return;
    this.adOpen = true;
    const watched = await showRewardedAd('무료 부활');
    this.adOpen = false;
    if (watched) this.revive();
  }

  private async doubleReward() {
    if (this.adOpen || this.rewardDoubled || !this.finished || this.hp <= 0) return;
    this.adOpen = true;
    this.hud.doubleButton.disabled = true;
    const watched = await showRewardedAd('클리어 보상 2배');
    this.adOpen = false;
    this.hud.doubleButton.disabled = false;
    if (!watched || this.rewardDoubled || !this.finished) return;
    this.rewardDoubled = true;
    addCurrency(this.reward);
    this.hud.setReward(this.reward, true);
  }

  update(_time: number, delta: number) {
    if (this.finished) return;
    const now = this.time.now;
    if (this.hitStopUntil) {
      if (now < this.hitStopUntil) return;
      this.hitStopUntil = 0;
      this.physics.world.resume();
    }
    const input = this.frameInput = this.controls.poll(now);
    const player = this.player;
    const heldRope = this.ropes.find((rope) => rope.held);
    if (heldRope && input.jumpPressed && heldRope.canRelease(now)) {
      heldRope.release(player, now, input.direction);
      input.jumpPressed = false;
      this.audio.play('jump');
      this.rig.event('release');
    }
    const step = player.update(now, delta, input, this.platforms.carryVx());
    if (step.jumped) { this.audio.play('jump'); this.rig.event('jump'); this.effects.jump(player.x, player.body.bottom); }
    if (step.dashed) { this.audio.play('boost'); this.effects.boostEntry(player.x, player.y); }
    if (step.landed) {
      this.rig.event('land', Phaser.Math.Clamp(step.landingSpeed / 650, 0.35, 1.3));
      if (step.landingSpeed > 100) this.audio.play('land');
      if (step.landingSpeed > 260) this.effects.land(player.x, player.body.bottom, Phaser.Math.Clamp(step.landingSpeed / 650, 0.5, 1.3));
    }
    for (const rope of this.ropes) {
      rope.update(now, delta, player, rope.held ? input.direction : 0);
      if (!rope.held && rope.tryGrab(player, now)) { this.audio.play('grab'); this.rig.event('grab'); }
    }
    this.boss?.update(now);
    this.platforms.update();
    this.pads.update();
    const view = this.cameras.main.worldView;
    this.enemies.update(now, view, player.x, player.y, Math.abs(player.body.velocity.x));
    const sections = STAGES[this.stageIndex].sections;
    if (sections) {
      let sectionIndex = 0;
      for (let i = 1; i < sections.length; i++) if (player.x >= sections[i].x) sectionIndex = i;
      if (sectionIndex !== this.currentSection) {
        this.currentSection = sectionIndex;
        this.hud.setStatus(`${sections[sectionIndex].title} · ${sections[sectionIndex].hint}`);
      }
    }
    if (player.sprite.x < 15) {
      player.sprite.x = 15;
      player.body.setVelocityX(Math.max(0, player.body.velocity.x));
    }
    if (player.y > 720) {
      this.loseHp();
      if (!this.finished) this.respawn();
    }
  }

  // POST_UPDATE: physics has settled, so sprites, effects and HUD read final positions.
  private render(_time: number, delta: number) {
    const now = this.time.now;
    const { player } = this;
    this.effects.update(delta);
    const view = this.cameras.main.worldView;
    this.visuals.update(view);
    this.enemies.render(view, now);
    for (const rope of this.ropes) rope.draw(view, now);
    const vx = player.body.velocity.x;
    const speed = Math.abs(vx);
    const grounded = player.isGrounded(now);
    const input = this.frameInput;
    const skidding = grounded && !player.rolling && speed > 90 && input.direction !== 0 && input.direction !== Math.sign(vx);
    this.rig.update({
      now, deltaMs: delta, x: player.x, bottom: player.body.bottom, centerY: player.y,
      groundY: grounded ? player.body.bottom : this.groundBelow(player.x, player.body.bottom),
      vx, vy: player.body.velocity.y, grounded, rolling: player.rolling, held: player.held,
      hurt: player.isHurt(now), dead: player.dead,
      skidding,
      flicker: !this.finished && player.isInvulnerable(now) && Math.floor(now / 80) % 2 === 0,
      facing: speed > 8 && !this.finished ? Math.sign(vx) : player.facing,
      ropeTilt: this.ropes.find((rope) => rope.held)?.tilt ?? 0,
    });
    this.audio.setRollHum(!this.finished && player.rolling && grounded, speed);
    if (this.finished) return;
    if (grounded && !player.rolling && speed > 60) {
      this.stepDistance += speed * Math.min(delta, 50) / 1000;
      if (this.stepDistance > 46) { this.stepDistance = 0; this.audio.play('step'); }
    }
    if (player.rolling && !this.wasRolling) {
      this.audio.play('roll');
      this.effects.ring(player.x, player.y + 6, 0xcaffef, 0.7);
    }
    this.wasRolling = player.rolling;
    if (!this.hitStopUntil) {
      const direction = Math.sign(vx) || player.facing;
      if (player.rolling) {
        this.effects.trail(this.rig.ghost(), now);
        if (grounded) this.effects.rollSparks(player.x, player.body.bottom, direction, now);
      } else if (grounded && speed > PHYSICS.runSpeed * 0.75) this.effects.dust(player.x, player.body.bottom - 3, direction, now);
      if (skidding) this.effects.skid(player.x, player.body.bottom, direction, now);
      if (player.isBoosted(now)) this.effects.boostStreaks(player.x, player.y, direction, now);
    }
    this.cameraControl.update(delta, vx, player.facing);
    this.hud.setSpeed(speed, player.rolling);
  }

  private groundBelow(x: number, y: number) {
    let top: number | undefined;
    for (const surface of this.surfaces) {
      if (x >= surface.left && x <= surface.right && surface.top >= y - 2 && (top === undefined || surface.top < top)) top = surface.top;
    }
    return top;
  }

  private debugState() {
    const { player } = this;
    const now = this.time.now;
    return {
      stage: this.stageIndex, x: Math.round(player.x), y: Math.round(player.y),
      vx: Math.round(player.body.velocity.x), vy: Math.round(player.body.velocity.y),
      rolling: player.rolling, grounded: player.isGrounded(now), held: player.held, pose: player.pose(now),
      hp: this.hp, score: this.coinCount * COMBAT.coinScore + this.enemyScore, coins: this.coinCount, finished: this.finished,
      enemiesAlive: this.enemies.list.filter((enemy) => enemy.sprite.active).length,
      enemies: this.enemies.list.filter((enemy) => enemy.sprite.active)
        .map((enemy) => ({ kind: enemy.kind, x: Math.round(enemy.body.center.x), y: Math.round(enemy.body.center.y), hp: enemy.hp, state: enemy.state })),
      boss: this.boss?.snapshot,
    };
  }
}
