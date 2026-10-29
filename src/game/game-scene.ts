import Phaser from 'phaser';
import { STAGES, type PadKind, type StageData } from '../stages';
import { createBackground, createTextures, THEMES } from '../visuals';
import { GameAudio } from '../audio';
import { GameEffects } from '../effects';
import { bindAppEnvironment } from '../app-environment';
import { installPerformanceDiagnostics } from '../performance';
import { getEquippedRobot, getPlayerProgress, unlockNextStage } from '../progress';
import { COMBAT, GIMMICK, PHYSICS } from './config';
import { classifyContact, createContactBox, type ContactRules } from './contact';
import { InputController, type Control, type InputFrame } from './input';
import { Player } from './player';
import { PlayerAnimator } from './player-animation';
import { EnemySystem, type EnemyConfig } from './enemies';
import { VisualSync } from './visual-sync';
import { Hud } from './hud';
import { SpeedCamera } from './camera';
import { PadSystem } from './mechanics/pads';
import { MovingPlatforms } from './mechanics/moving-platforms';
import { SwingRope } from './mechanics/swing-rope';
import { BreakableWalls } from './mechanics/breakable-walls';
import { MachineBoss, type BossRecoil } from './boss';
import { installDebugHooks } from './debug';

const START = { x: 90, y: 440 };
const CHECKPOINT_INACTIVE = 0x8294b0;
const CHECKPOINT_ACTIVE = 0x60dfb1;
const BOSS_STAGE = 2;
const WALL_HIT_STOP_MS = 40;
const RULES: ContactRules = {
  stompTolerance: COMBAT.stompTolerance, minStompSpeed: COMBAT.minStompSpeed,
  minClosingSpeed: COMBAT.minClosingSpeed, rollExitSpeed: PHYSICS.rollExitSpeed,
};

type SceneData = { stageIndex?: number; hp?: number; coinCount?: number; enemyScore?: number; bossTest?: boolean };

// Stage orchestration: builds the level, routes contacts to the rule modules and owns HP/score.
export class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }
  private playerStats = getPlayerProgress().stats;
  private robot = getEquippedRobot();
  private stageIndex = 0;
  private bossTest = false;
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
  private frameInput: InputFrame = { direction: 0, jumpPressed: false, jumpHeld: false };
  private targetBox = createContactBox();
  private hud!: Hud;
  private controls!: InputController;
  private audio!: GameAudio;
  private effects!: GameEffects;
  private visuals!: VisualSync;
  private player!: Player;
  private animator!: PlayerAnimator;
  private speedCamera!: SpeedCamera;
  private enemies!: EnemySystem;
  private pads!: PadSystem;
  private platforms!: MovingPlatforms;
  private ropes: SwingRope[] = [];
  private boss?: MachineBoss;

  init(data: SceneData = {}) {
    this.playerStats = getPlayerProgress().stats;
    this.robot = getEquippedRobot();
    this.bossTest = data.bossTest === true;
    this.stageIndex = this.bossTest ? BOSS_STAGE : Phaser.Math.Clamp(Math.floor(data.stageIndex ?? 0), 0, Math.min(STAGES.length, getPlayerProgress().unlockedStage) - 1);
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
    this.ropes = [];
    this.boss = undefined;
  }

  create() {
    document.body.dataset.screen = document.documentElement.dataset.screen = 'game';
    createTextures(this);
    const stage = STAGES[this.stageIndex];
    const spawn = this.bossTest && stage.boss ? { x: stage.boss.entry + 40, y: 450 } : START;
    if (this.bossTest) this.respawnPoint = spawn;
    this.hud = new Hud();
    this.hud.hideResult();
    this.audio = new GameAudio(stage.theme);
    this.effects = new GameEffects(this);
    this.visuals = new VisualSync(this);
    this.controls = new InputController(this);
    this.cameras.main.setZoom(1);
    const theme = THEMES[stage.theme];
    document.body.style.setProperty('--accent', theme.accent);
    document.body.dataset.theme = String(stage.theme);
    this.hud.setStage(this.stageIndex, STAGES.length);
    this.hud.setStatus(`${stage.name} · ← → 이동 · 점프 · 빠르게 달리면 자동 구르기`);
    this.physics.resume();
    this.physics.world.setBounds(0, -200, stage.width, 1100);
    const { solid, oneWay } = this.buildTerrain(stage);

    this.player = new Player(this, spawn.x, spawn.y);
    this.animator = new PlayerAnimator(this, this.player.sprite, this.robot.animationPrefix);
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
    this.enemies = new EnemySystem(this, enemyConfigs, this.visuals, this.stageIndex === 0);
    this.physics.add.overlap(this.player.sprite, this.enemies.group, (_player, object) => this.touchEnemy(object));
    if (stage.boss) this.createBoss(stage);

    this.cameras.main.setBounds(0, 0, stage.width, 600);
    this.speedCamera = new SpeedCamera(this.cameras.main, this.player.sprite);
    this.speedCamera.follow(spawn.x, spawn.y);
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.render, this);
    const unbindEnvironment = bindAppEnvironment(this, () => this.resetInput(), () => this.audio.pauseForBackground(), () => this.audio.resumeFromBackground());
    installPerformanceDiagnostics(this);
    installDebugHooks(this, {
      scene: this,
      state: () => this.debugState(),
      press: (control: Control) => this.controls.press(control, -1),
      release: (control: Control) => this.controls.release(control, -1),
      teleport: (x: number, y: number) => { this.detachRopes(); this.player.respawn(x, y, this.time.now); },
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unbindEnvironment();
      this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.render, this);
      this.resultTimer?.remove(false);
      this.controls.destroy();
      this.audio.destroy();
      this.effects.destroy();
      this.boss?.destroy();
      this.hud.nextButton.onclick = null;
      for (const id of ['restart', 'result-restart', 'lobby', 'result-lobby', 'boss-test']) document.querySelector<HTMLButtonElement>(`#${id}`)!.onclick = null;
      this.hud.hideResult();
    });
    this.bindButtons();
  }

  private buildTerrain(stage: StageData) {
    const theme = THEMES[stage.theme];
    const trackGraphic = createBackground(this, stage.theme, stage.width);
    const solid = this.physics.add.staticGroup();
    const oneWay = this.physics.add.staticGroup();
    const platform = (x: number, y: number, width: number, height: number, isOneWay = false) => {
      const block = this.add.rectangle(x, y, width, height, theme.soil, 0);
      block.setVisible(false);
      this.physics.add.existing(block, true);
      (isOneWay ? oneWay : solid).add(block);
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
    return { solid, oneWay };
  }

  private buildPickups(stage: StageData) {
    const coins = this.physics.add.staticGroup();
    for (const [x, y] of stage.coins) {
      const coin = this.add.circle(x, y, 11, 0xffd35a);
      this.physics.add.existing(coin, true);
      coins.add(coin);
      this.visuals.attach(coin, 'coin-0', 28, 28).play('coin-spin');
    }
    this.updateScore();
    this.physics.add.overlap(this.player.sprite, coins, (_player, object) => {
      const coin = object as Phaser.GameObjects.Arc;
      if (this.finished || !coin.active) return;
      coin.setActive(false).setVisible(false);
      (coin.body as Phaser.Physics.Arcade.StaticBody).enable = false;
      this.coinCount += 1;
      this.audio.play('coin');
      this.effects.burst(coin.x, coin.y, 0xffe18a, 8);
      this.updateScore();
    });

    const hazards = this.physics.add.staticGroup();
    const traps: [number, number][] = [...stage.spikes.map((x): [number, number] => [x, 465]), ...(stage.traps ?? [])];
    for (const [x, y] of traps) {
      const spike = this.add.triangle(x, y, 0, 30, 18, 0, 36, 30, 0xff6f80);
      this.physics.add.existing(spike, true);
      hazards.add(spike);
      (spike.body as Phaser.Physics.Arcade.StaticBody).setSize(24, 24).setOffset(6, 6);
      this.visuals.attach(spike, 'spike-art', 36, 30);
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
      this.visuals.attach(star, 'reward-star', 38, 38);
    });
    this.physics.add.overlap(this.player.sprite, rewards, (_player, object) => {
      const reward = object as Phaser.GameObjects.Rectangle;
      if (this.finished || !reward.active) return;
      reward.setActive(false).setVisible(false);
      (reward.body as Phaser.Physics.Arcade.StaticBody).enable = false;
      this.enemyScore += reward.getData('score') as number;
      this.updateScore();
      this.audio.play('coin');
      this.effects.burst(reward.x, reward.y, 0xffd578, 12, 150);
      this.hud.setStatus(`숨겨진 보상! +${reward.getData('score')}점`);
    });

    const checkpoints = stage.checkpoints ?? [stage.checkpoint];
    checkpoints.forEach((point, index) => {
      const pole = this.add.rectangle(point.x, point.y - 20, 8, 100, CHECKPOINT_INACTIVE);
      const flag = this.add.triangle(point.x + 23, point.y - 54, 0, 0, 38, 14, 0, 28, CHECKPOINT_INACTIVE);
      this.add.text(point.x - 50, point.y - 94, 'CHECKPOINT', { fontSize: '13px', color: '#bad0e4' });
      this.physics.add.existing(pole, true);
      this.physics.add.overlap(this.player.sprite, pole, () => {
        if (this.finished || this.bossTest || index <= this.lastCheckpoint) return;
        this.lastCheckpoint = index;
        this.checkpointActive = true;
        this.respawnPoint = point;
        pole.setFillStyle(CHECKPOINT_ACTIVE);
        flag.setFillStyle(CHECKPOINT_ACTIVE);
        this.hud.setStatus('체크포인트 활성화! 다음 부활은 이곳에서');
      });
    });

    const goalX = stage.width - 130;
    const goalY = stage.goalY ?? 420;
    this.add.rectangle(goalX, goalY, 6, 120, 0xeaf2ff);
    this.add.triangle(goalX + 27, goalY - 42, 0, 0, 48, 18, 0, 36, 0x60dfb1);
    this.add.text(goalX - 42, goalY - 90, 'GOAL', { fontSize: '16px', color: '#60dfb1' });
    const goal = this.add.rectangle(goalX, goalY, 44, 120, 0x60dfb1, 0.12);
    this.physics.add.existing(goal, true);
    this.physics.add.overlap(this.player.sprite, goal, () => {
      if (!this.boss || this.boss.defeated) this.endStage(true);
    });
    if (stage.boss) this.add.text(goalX - 70, 285, '보스를 처치하면 클리어', { fontSize: '13px', color: '#ffc1a0' });
  }

  private createBoss(stage: StageData) {
    this.boss = new MachineBoss(this, stage.boss!, this.player.sprite, stage.width, this.effects, {
      contact: (body) => classifyContact(this.player.contactBox(), this.player.rolling, this.toBox(body), RULES),
      hurt: (x) => { this.takeHit(x); },
      recoil: (x, kind) => this.bossRecoil(x, kind),
      struck: (x, y) => {
        this.audio.play('boss-hit');
        this.effects.impact(x, y, 0xffd58a);
        this.cameras.main.shake(110, 0.005);
        this.hitStop(COMBAT.bossHitStopMs);
      },
      minionDown: (x, y) => {
        this.enemyScore += COMBAT.enemyScore;
        this.updateScore();
        this.audio.play('enemy');
        this.effects.burst(x, y, 0x94dcca, 10, 140);
      },
      defeated: (x, y) => {
        this.enemyScore += COMBAT.bossScore;
        this.updateScore(); this.audio.play('enemy'); this.effects.burst(x, y, 0xffd58a, 12, 180);
        this.endStage(true);
      },
      damagePerHit: this.playerStats.attack,
    });
  }

  private bindButtons() {
    const button = (id: string) => document.querySelector<HTMLButtonElement>(`#${id}`)!;
    button('restart').onclick = () => this.restartGame();
    button('result-restart').onclick = () => this.restartGame(this.hp === 0 || this.bossTest);
    button('boss-test').onclick = () => {
      this.resetInput(); this.finished = true; this.hud.hideResult();
      this.scene.restart({ stageIndex: BOSS_STAGE, bossTest: true });
    };
    const returnToLobby = () => {
      this.resetInput(); this.finished = true; this.hud.hideResult();
      this.scene.start('MainMenuScene');
    };
    button('lobby').onclick = returnToLobby;
    button('result-lobby').onclick = returnToLobby;
    this.hud.nextButton.onclick = () => {
      if (!this.finished || this.bossTest || this.hp <= 0 || this.stageIndex >= STAGES.length - 1) return;
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
      this.effects.ring(this.player.x, this.player.y, 0x6ce2de, 1.2);
      return;
    }
    const direction = kind === 'spring-right' ? 1 : kind === 'spring-left' ? -1 : 0;
    this.player.launch(now, direction ? direction * GIMMICK.springDiagonalX : undefined, -(direction ? GIMMICK.springDiagonalY : GIMMICK.springSpeed));
    this.audio.play('spring');
    this.effects.burst(x, y - 8, 0xffc27a, 8, 140);
  }

  private onWallBreak(x: number, y: number) {
    this.audio.play('break');
    this.effects.debris(x, y, 0xb79572, 12);
    this.effects.ring(x, y, 0xffe1a8, 1.4);
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
    this.frameInput.direction = 0;
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
      bossTest: this.bossTest,
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
    this.animator.reset();
    this.effects.clear();
    this.speedCamera.snap(spawn.x, spawn.y, 1);
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
    const allCleared = cleared && this.stageIndex === STAGES.length - 1;
    if (cleared && !this.bossTest) unlockNextStage(this.stageIndex + 1, STAGES.length);
    this.hud.setStatus(cleared ? (allCleared ? '전체 스테이지 클리어! 축하합니다' : `Stage ${this.stageIndex + 1} 클리어!`) : 'HP가 모두 소진되었습니다');
    const showResult = () => this.hud.showResult(
      cleared ? (allCleared ? 'ALL CLEAR!' : 'STAGE CLEAR!') : 'GAME OVER',
      `점수 ${this.coinCount * COMBAT.coinScore + this.enemyScore}점 · 코인 ${this.coinCount}개`,
      cleared && !allCleared && !this.bossTest,
      this.bossTest ? '보스 재도전' : cleared ? 'Stage 1부터 다시 시작' : `Stage ${this.stageIndex + 1}에서 부활 (HP ${this.playerStats.maxHp})`,
    );
    if (cleared) this.cameras.main.zoomTo(1.15, 450, 'Sine.easeOut');
    else this.effects.burst(this.player.x, this.player.y, 0xd7dde0, 12, 120);
    this.resultTimer = this.time.delayedCall(cleared ? 480 : 650, showResult);
  }

  update(_time: number, delta: number) {
    if (this.finished) return;
    const now = this.time.now;
    if (this.hitStopUntil) {
      if (now < this.hitStopUntil) return;
      this.hitStopUntil = 0;
      this.physics.world.resume();
    }
    const input = this.frameInput = this.controls.poll();
    const player = this.player;
    const heldRope = this.ropes.find((rope) => rope.held);
    if (heldRope && input.jumpPressed && heldRope.canRelease(now)) {
      heldRope.release(player, now, input.direction);
      input.jumpPressed = false;
      this.audio.play('jump');
    }
    const step = player.update(now, delta, input, this.platforms.carryVx());
    if (step.jumped) this.audio.play('jump');
    if (step.landed && step.landingSpeed > 100) this.audio.play('land');
    for (const rope of this.ropes) {
      rope.update(now, delta, player, rope.held ? input.direction : 0);
      if (!rope.held && rope.tryGrab(player, now)) this.audio.play('grab');
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
    this.enemies.syncHealthBars(view);
    for (const rope of this.ropes) rope.draw(view, now);
    const vx = player.body.velocity.x;
    const speed = Math.abs(vx);
    const pose = player.pose(now);
    const entered = this.animator.update({
      pose, speed,
      facing: speed > 8 && !this.finished ? Math.sign(vx) : player.facing,
      tilt: this.ropes.find((rope) => rope.held)?.tilt ?? 0,
      flicker: !this.finished && player.isInvulnerable(now) && Math.floor(now / 80) % 2 === 0,
      boosted: player.isBoosted(now),
    });
    if (this.finished) {
      if (pose !== 'dead') this.animator.freeze();
      return;
    }
    if (entered) {
      this.audio.play('roll');
      this.effects.ring(player.x, player.y + 6, 0xcaffef, 0.7);
    }
    if (!this.hitStopUntil) {
      if (pose === 'roll' || player.isBoosted(now)) this.effects.trail(this.animator.sprite, now);
      if (player.isGrounded(now) && speed > PHYSICS.runSpeed * 0.9) this.effects.dust(player.x, player.body.bottom - 3, Math.sign(vx), now);
    }
    this.speedCamera.update(delta, vx, player.facing);
    this.hud.setSpeed(speed, player.rolling);
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
