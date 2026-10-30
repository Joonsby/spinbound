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
import { addCurrency, addItems, equipCharacter, getEquippedRobot, getPlayerProgress, grantEarnedCharacters, spendCurrency, unlockNextStage, ITEM_IDS, type ItemId } from '../progress';
import { robotPortraitUrl } from '../graphics/robot-art';
import type { Character } from '../characters';
import { showRewardedAd } from '../ads';
import { confirmDialog } from '../confirm-dialog';
import { BOOSTS, COMBAT, ECONOMY, GIMMICK, HP_POINTS, PHYSICS } from './config';
import { clearReward, reviveOffer, worldBonus } from './economy';
import { routeOf, routeProgress, routeSpot, STAGES_PER_WORLD, worldOf } from '../stage-gen';
import { classifyContact, createContactBox, type ContactRules } from './contact';
import { InputController, type Control, type InputFrame } from './input';
import { Player } from './player';
import { RobotRig } from '../graphics/robot-rig';
import { createRobotArt } from '../graphics/robot-art';
import { LOGICAL_HEIGHT, RENDER_SCALE_EVENT } from '../graphics/display';
import { EnemySystem, type EnemyConfig } from './enemies';
import { VisualSync } from './visual-sync';
import { Hud } from './hud';
import { CameraController } from './camera';
import { PadSystem } from './mechanics/pads';
import { MovingPlatforms } from './mechanics/moving-platforms';
import { SwingRope } from './mechanics/swing-rope';
import { BreakableWalls } from './mechanics/breakable-walls';
import { installDebugHooks } from './debug';
import { markTipSeen, resetTips, seenTips } from './tutorial';

const START = { x: 90, y: 440 };
const CRYSTAL_IDLE_TINT = 0x8fa3b8;
const FLOOR_TOP = 480;
const WALL_HIT_STOP_MS = 40;
const RULES: ContactRules = {
  stompTolerance: COMBAT.stompTolerance, minStompSpeed: COMBAT.minStompSpeed,
  minClosingSpeed: COMBAT.minClosingSpeed, rollExitSpeed: PHYSICS.rollExitSpeed,
};

export type SceneData = { stageIndex?: number; hp?: number; coinCount?: number; enemyScore?: number; boosts?: ItemId[] };

// Stage orchestration: builds the level, routes contacts to the rule modules and owns HP/score.
export class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }
  private playerStats = getPlayerProgress().stats;
  private robot = getEquippedRobot();
  private stageIndex = 0;
  private hp = 3;
  private maxHp = 3;
  private shield = false;
  private magnet = false;
  private shieldBubble?: Phaser.GameObjects.Arc;
  private coinList: Phaser.GameObjects.Arc[] = [];
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
  private tipOpen = false;
  private pauseOpen = false;
  private confirmOpen = false;
  private unlocks: Character[] = [];
  private tipOpenedAt = 0;
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
  private route: { x: number; y: number }[] = [];
  // Feet height the last time the player stood on something; places them on a floor of the route.
  private footY = 0;
  private theme!: StageTheme;

  init(data: SceneData = {}) {
    this.playerStats = getPlayerProgress().stats;
    this.robot = getEquippedRobot();
    this.stageIndex = Phaser.Math.Clamp(Math.floor(data.stageIndex ?? 0), 0, Math.min(STAGES.length, getPlayerProgress().unlockedStage) - 1);
    const boosts = new Set(data.boosts ?? []);
    this.shield = boosts.has('shield');
    this.magnet = boosts.has('magnet');
    const extraHp = boosts.has('extra-heart') ? 1 : 0;
    this.maxHp = this.playerStats.maxHp + extraHp;
    this.hp = Math.min(data.hp ?? this.playerStats.maxHp, this.playerStats.maxHp) + extraHp;
    this.shieldBubble = undefined;
    this.coinList = [];
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
    this.tipOpen = false;
    this.pauseOpen = false;
    this.confirmOpen = false;
    this.unlocks = [];
    this.ropes = [];
  }

  create() {
    document.body.dataset.screen = document.documentElement.dataset.screen = 'game';
    createRobotArt(this);
    createPropArt(this);
    createEnemyArt(this);
    const stage = STAGES[this.stageIndex];
    const spawn = stage.start ?? START;
    this.respawnPoint = spawn;
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
    this.route = routeOf(stage);
    this.footY = spawn.y + 40;
    this.hud.setProgressMarks((stage.checkpoints ?? [stage.checkpoint]).map((point) => routeProgress(this.route, point.x, point.y + 30)));
    this.hud.setStatus(`${stage.name} · ← → 이동 · 점프 · 두 번 톡톡 스핀 대시`);
    this.physics.resume();
    const worldTop = stage.top ?? 0;
    this.physics.world.setBounds(0, worldTop - 200, stage.width, 1100 - worldTop);
    const { solid, oneWay } = this.buildTerrain(stage);

    this.player = new Player(this, spawn.x, spawn.y);
    this.rig = new RobotRig(this, spawn.x, spawn.y + 21);
    if (this.shield) this.shieldBubble = this.add.circle(spawn.x, spawn.y, 34, 0x5cf2ff, 0.12).setStrokeStyle(3, 0x5cf2ff, 0.85).setDepth(DEPTH.player + 0.5);
    this.hud.setBoosts(this.shield, this.magnet);
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

    this.cameraControl = new CameraController(this.cameras.main, this.player.sprite, stage.width, worldTop);
    this.cameraControl.follow(spawn.x, spawn.y);
    const onRenderScale = () => this.cameraControl.apply();
    this.game.events.on(RENDER_SCALE_EVENT, onRenderScale);
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.render, this);
    const tip = document.querySelector<HTMLElement>('#tip')!;
    const onTipClick = () => this.closeTip();
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || this.confirmOpen) return;
      if (this.tipOpen) { if (['Space', 'Enter', 'Escape'].includes(event.code)) this.closeTip(); }
      else if (event.code === 'Escape' || event.code === 'KeyP') { if (this.pauseOpen) this.closePause(); else this.openPause(); }
    };
    tip.addEventListener('click', onTipClick);
    document.addEventListener('keydown', onKey);
    // Leaving the app mid-run opens the pause menu, so it waits for the player on return.
    const unbindEnvironment = bindAppEnvironment(this, () => this.resetInput(),
      () => { this.audio.pauseForBackground(); this.openPause(); },
      () => { if (!this.pauseOpen) this.audio.resumeFromBackground(); });
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
      // Leaving from the pause menu: wake the shared audio context for the next scene.
      if (this.pauseOpen) this.audio.resumeFromBackground();
      this.audio.destroy();
      this.effects.destroy();
      this.hud.nextButton.onclick = null;
      for (const id of ['restart', 'result-restart', 'lobby', 'result-lobby', 'result-double', 'revive-ad', 'revive-coins', 'revive-skip', 'unlock-equip', 'unlock-keep', 'pause', 'pause-resume', 'pause-tips']) document.querySelector<HTMLButtonElement>(`#${id}`)!.onclick = null;
      this.hud.hideResult();
      this.hud.hideTip();
      // The animation manager is shared by every scene.
      if (this.tipOpen || this.pauseOpen) this.anims.resumeAll();
      tip.removeEventListener('click', onTipClick);
      document.removeEventListener('keydown', onKey);
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
    // Land hanging in the air is jumped through from below; ground and anything standing on it stay solid.
    const rects = stage.platforms.map(toRect);
    const floating = (rect: ReturnType<typeof toRect>) => rect.bottom < LOGICAL_HEIGHT
      && !rects.some((other) => other !== rect && Math.abs(other.top - rect.bottom) < 1 && other.left < rect.right && other.right > rect.left);
    stage.platforms.forEach((platform, index) => block(platform, floating(rects[index]) ? oneWay : solid));
    stage.oneWayPlatforms?.forEach((platform) => block(platform, oneWay));
    const avoid = [...stage.spikes, ...(stage.traps ?? []).map(([x]) => x), ...stage.pads.map(([x]) => x), ...(stage.walls ?? []).map((wall) => wall.x)];
    buildTerrain(this, theme, stage.platforms.map(toRect), (stage.oneWayPlatforms ?? []).map(toRect), avoid);
    stage.signs?.forEach((sign) => this.addSign(sign.x, sign.y, sign.text, sign.floor));
    return { solid, oneWay };
  }

  private addSign(x: number, y: number, text: string, floor = FLOOR_TOP) {
    const label = addLabel(this, x, y, text, { fontSize: '14px', fontStyle: 'bold', color: '#FFF4DC', stroke: '#5A3418', strokeThickness: 3 }).setOrigin(0.5).setDepth(DEPTH.prop + 0.2);
    const scale = artScale(PROP_KEYS.sign);
    const board = this.add.nineslice(x, y, PROP_KEYS.sign, undefined, (label.width + 26) * scale, (label.height + 14) * scale, SIGN_SLICE * scale, SIGN_SLICE * scale, SIGN_SLICE * scale, SIGN_SLICE * scale)
      .setScale(1 / scale).setDepth(DEPTH.prop + 0.1);
    const postTop = y + board.displayHeight / 2 - 4;
    if (postTop < floor) {
      this.add.image(x, postTop, PROP_KEYS.post).setOrigin(0.5, 0).setDepth(DEPTH.prop).setDisplaySize(8, floor - postTop + 2);
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
    this.coinList = coins.getChildren() as Phaser.GameObjects.Arc[];
    this.physics.add.overlap(this.player.sprite, coins, (_player, object) => this.collectCoin(object as Phaser.GameObjects.Arc));

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

    const goalX = stage.goal?.x ?? stage.width - 130;
    const goalY = stage.goal?.y ?? stage.goalY ?? 420;
    const goalFloor = goalY + 60;
    const portal = this.add.image(goalX, goalFloor - 4, PROP_KEYS.portal).setOrigin(0.5, 1).setDepth(DEPTH.prop - 0.1).setScale(1 / artScale(PROP_KEYS.portal));
    this.tweens.add({ targets: portal, alpha: 0.55, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.add.image(goalX, goalFloor + 2, PROP_KEYS.goal).setOrigin(0.5, 1).setDepth(DEPTH.prop).setScale(1 / artScale(PROP_KEYS.goal));
    const goal = this.add.rectangle(goalX, goalY, 44, 120, 0x60dfb1, 0);
    this.physics.add.existing(goal, true);
    this.physics.add.overlap(this.player.sprite, goal, () => this.endStage(true));
  }

  private bindButtons() {
    const button = (id: string) => document.querySelector<HTMLButtonElement>(`#${id}`)!;
    // With a hundred stages both restart buttons replay the current one.
    // Mid-run (pause menu) restart and home throw the run away, so they ask first; after a result they do not.
    button('restart').onclick = () => { void this.confirmLeave('restart'); };
    button('result-restart').onclick = () => this.restartGame(true);
    this.hud.unlockEquipButton.onclick = () => { if (this.unlocks[0]) equipCharacter(this.unlocks[0].id); this.nextUnlock(); };
    this.hud.unlockKeepButton.onclick = () => this.nextUnlock();
    this.hud.pauseButton.onclick = () => this.openPause();
    this.hud.resumeButton.onclick = () => this.closePause();
    this.hud.tipsResetButton.onclick = () => { resetTips(); this.hud.tipsResetButton.disabled = true; };
    button('lobby').onclick = () => { void this.confirmLeave('home'); };
    button('result-lobby').onclick = () => this.returnToLobby();
    this.hud.doubleButton.onclick = () => { void this.doubleReward(); };
    this.hud.reviveAdButton.onclick = () => { void this.reviveWithAd(); };
    this.hud.reviveCoinButton.onclick = () => { if (!this.adOpen && spendCurrency(ECONOMY.reviveCost)) this.revive(); };
    this.hud.reviveSkipButton.onclick = () => { if (!this.adOpen) this.showGameOver(); };
    this.hud.nextButton.onclick = () => {
      if (!this.finished || this.hp <= 0 || this.stageIndex >= STAGES.length - 1) return;
      this.resetInput();
      this.hud.hideResult();
      // The next stage starts from the item screen; this run's HP and score come along.
      this.scene.start('MenuScreenScene', { screen: 'prepare', stageIndex: this.stageIndex + 1, carry: { hp: this.hp, coinCount: this.coinCount, enemyScore: this.enemyScore } });
    };
  }

  private collectCoin(coin: Phaser.GameObjects.Arc) {
    if (this.finished || !coin.active) return;
    coin.setActive(false).setVisible(false);
    (coin.body as Phaser.Physics.Arcade.StaticBody).enable = false;
    this.coinCount += 1;
    this.rig.event('happy');
    this.audio.play('coin');
    this.effects.coin(coin.x, coin.y);
    this.updateScore();
  }

  // Coin magnet: nearby coins are collected and fly into the robot.
  private pullCoins() {
    const { x, y } = this.player;
    const reach = BOOSTS.magnetRadius ** 2;
    for (const coin of this.coinList) {
      if (!coin.active || (coin.x - x) ** 2 + (coin.y - y) ** 2 > reach) continue;
      const fly = this.add.image(coin.x, coin.y, PROP_KEYS.coin(0)).setDisplaySize(28, 28).setDepth(DEPTH.pickup);
      this.collectCoin(coin);
      this.tweens.add({ targets: fly, x, y, scale: fly.scale * 0.5, duration: 140, onComplete: () => fly.destroy() });
    }
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
    this.hud.setHp(this.hp, this.maxHp);
  }

  private resetInput() {
    this.controls?.reset();
    this.frameInput.direction = this.frameInput.dash = 0;
    this.frameInput.jumpHeld = this.frameInput.jumpPressed = false;
  }

  private detachRopes() {
    for (const rope of this.ropes) rope.detach(this.player, this.time.now);
  }

  private returnToLobby() {
    this.resetInput();
    this.finished = true;
    this.hud.hideResult();
    this.scene.start('MainMenuScene');
  }

  private async confirmLeave(action: 'restart' | 'home') {
    if (this.confirmOpen) return;
    this.confirmOpen = true;
    const confirmed = await confirmDialog(action === 'restart'
      ? { title: '다시 시작할까요?', message: '이번 판 진행은 사라져요', confirm: '다시하기' }
      : { title: '홈으로 나갈까요?', message: '이번 판 진행은 사라져요', confirm: '나가기' });
    this.confirmOpen = false;
    if (!confirmed || !this.scene.isActive()) return;
    if (action === 'restart') this.restartGame(true);
    else this.returnToLobby();
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
    this.detachRopes();
    this.ropes.forEach((rope) => rope.reset());
    this.resetInput();
    const spawn = this.respawnPoint;
    this.player.respawn(spawn.x, spawn.y, now);
    this.rig.reset();
    this.wasRolling = false;
    this.effects.clear();
    this.cameraControl.snap(spawn.x, spawn.y, 1);
    this.hud.setStatus(`${this.checkpointActive ? '체크포인트' : '시작 지점'}에서 부활 · ${this.deaths}회`);
  }

  private loseHp() {
    const now = this.time.now;
    if (this.finished || this.player.isInvulnerable(now)) return false;
    this.player.invulnerableUntil = now + COMBAT.invulnerableMs;
    if (this.shield) {
      this.shield = false;
      this.shieldBubble?.destroy();
      this.shieldBubble = undefined;
      this.hud.setBoosts(false, this.magnet);
      this.effects.ring(this.player.x, this.player.y, 0x5cf2ff, 1.4);
      this.audio.play('clang');
      this.hud.setStatus('보호막이 공격을 막았어요!');
      return true;
    }
    this.hp = Math.max(0, Math.round((this.hp - (1 - this.playerStats.defense / 100)) * 100) / 100);
    this.updateScore();
    this.audio.play('hurt');
    this.cameras.main.shake(130, 0.004);
    if (this.hp === 0) this.endStage(false);
    return true;
  }

  // Falling out of the stage kills outright, whatever the HP or shield.
  private fall() {
    if (this.finished) return;
    this.hp = 0;
    this.updateScore();
    this.endStage(false);
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
    this.finished = true;
    this.hitStopUntil = 0;
    this.resetInput();
    this.detachRopes();
    if (cleared) {
      this.player.stop();
      this.hud.setProgress(1, this.lastCheckpoint);
    } else this.player.die();
    this.physics.pause();
    this.audio.stopMusic();
    this.audio.play(cleared ? 'clear' : 'death');
    const allCleared = cleared && this.stageIndex === STAGES.length - 1;
    const firstClear = cleared && getPlayerProgress().unlockedStage <= this.stageIndex + 1;
    if (cleared) unlockNextStage(this.stageIndex + 1, STAGES.length);
    this.hud.setStatus(cleared ? (allCleared ? '전체 스테이지 클리어! 축하합니다' : `Stage ${this.stageIndex + 1} 클리어!`) : 'HP가 모두 소진되었습니다');
    if (cleared) {
      this.reward = clearReward(this.coinCount - this.stageStartCoins, ECONOMY);
      addCurrency(this.reward);
      const finale = (this.stageIndex + 1) % STAGES_PER_WORLD === 0;
      const special = finale && firstClear ? worldBonus(worldOf(this.stageIndex), ECONOMY) : 0;
      if (special) { addCurrency(special); addItems(ITEM_IDS); }
      this.unlocks = grantEarnedCharacters();
      this.cameraControl.celebrate(this);
      this.effects.confetti(this.player.x, this.player.y - 20);
      this.resultTimer = this.time.delayedCall(480, () => {
        this.hud.showResult('clear', allCleared ? 'ALL CLEAR!' : 'STAGE CLEAR!', this.totalScore(), this.coinCount, !allCleared, '다시 하기');
        this.hud.setReward(this.reward);
        this.hud.setWorldBonus(special || null);
        this.showUnlock();
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

  // Freezes the stage (physics, tweens, animations) while a tutorial tip is read.
  private openTip(index: number) {
    const sections = STAGES[this.stageIndex].sections!;
    const { title, hint } = sections[index];
    markTipSeen(index);
    this.tipOpen = true;
    this.tipOpenedAt = performance.now();
    this.freeze();
    this.hud.showTip(index + 1, sections.length, title.split(' · ').pop()!, hint);
  }

  private closeTip() {
    // A tap already under way when the tip opened must not dismiss it at once.
    if (!this.tipOpen || performance.now() - this.tipOpenedAt < 350) return;
    this.tipOpen = false;
    this.hud.hideTip();
    this.unfreeze();
  }

  private freeze() {
    this.resetInput();
    this.physics.pause();
    this.tweens.pauseAll();
    this.anims.pauseAll();
    this.audio.setRollHum(false);
  }

  private unfreeze() {
    this.resetInput();
    this.tweens.resumeAll();
    this.anims.resumeAll();
    this.physics.resume();
  }

  private openPause() {
    if (this.finished || this.tipOpen || this.pauseOpen || this.adOpen) return;
    this.pauseOpen = true;
    this.freeze();
    this.audio.pauseForBackground();
    const stage = STAGES[this.stageIndex];
    const checkpoints = (stage.checkpoints ?? [stage.checkpoint]).length;
    this.hud.showPause(`STAGE ${this.stageIndex + 1} · ${stage.name}`, {
      score: this.totalScore(), coins: this.coinCount, hp: Math.ceil(this.hp * HP_POINTS - 1e-6),
      checkpoint: `${this.lastCheckpoint + 1} / ${checkpoints}`,
      items: [...(this.shield ? [{ icon: 'shield', name: '보호막' }] : []), ...(this.magnet ? [{ icon: 'magnet', name: '코인 자석' }] : [])],
    });
  }

  private closePause() {
    if (!this.pauseOpen) return;
    this.pauseOpen = false;
    this.hud.hidePause();
    this.unfreeze();
    this.audio.resumeFromBackground();
  }

  // New robots from this clear, one card at a time over the result card.
  private showUnlock() {
    const character = this.unlocks[0];
    if (character) this.hud.showUnlock(character, robotPortraitUrl(character), this.unlocks.length);
    else this.hud.hideUnlock();
  }

  private nextUnlock() {
    this.unlocks.shift();
    this.showUnlock();
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
    this.hud.hideRevive();
    this.finished = false;
    this.hp = this.maxHp;
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
    if (this.finished || this.tipOpen || this.pauseOpen) return;
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
    this.platforms.update();
    this.pads.update();
    const view = this.cameras.main.worldView;
    this.enemies.update(now, view, player.x, player.y, Math.abs(player.body.velocity.x));
    if (this.magnet) this.pullCoins();
    const sections = STAGES[this.stageIndex].sections;
    if (sections) {
      let sectionIndex = 0;
      for (let i = 1; i < sections.length; i++) if (player.x >= sections[i].x) sectionIndex = i;
      if (sectionIndex !== this.currentSection) {
        this.currentSection = sectionIndex;
        this.hud.setStatus(`${sections[sectionIndex].title} · ${sections[sectionIndex].hint}`);
        if (STAGES[this.stageIndex].tutorial && !seenTips().has(sectionIndex)) this.openTip(sectionIndex);
      }
    }
    const right = STAGES[this.stageIndex].width - 15;
    if (player.sprite.x > right) {
      player.sprite.x = right;
      player.body.setVelocityX(Math.min(0, player.body.velocity.x));
    }
    if (player.sprite.x < 15) {
      player.sprite.x = 15;
      player.body.setVelocityX(Math.max(0, player.body.velocity.x));
    }
    if (player.y > 720) this.fall();
  }

  // POST_UPDATE: physics has settled, so sprites, effects and HUD read final positions.
  private render(_time: number, delta: number) {
    if (this.tipOpen || this.pauseOpen) return;
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
    this.shieldBubble?.setPosition(player.x, player.y);
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
    if (grounded) this.footY = player.body.bottom;
    const spot = routeSpot(this.route, player.x, this.footY);
    this.cameraControl.setFloor(spot.floor);
    this.cameraControl.update(delta, vx, player.facing);
    this.hud.setSpeed(speed, player.rolling);
    this.hud.setProgress(spot.share, this.lastCheckpoint);
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
    };
  }
}
