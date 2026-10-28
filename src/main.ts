import Phaser from 'phaser';
import { STAGES } from './stages';
import { createBackground, createTextures, THEMES, type PlayerPose } from './visuals';
import { closeAudio, GameAudio, GameEffects } from './effects';
import { bindAppEnvironment } from './app-environment';
import './style.css';

const MOVE_SPEED = 270;
const DASH_SPEED = 460;
const MOVE_ACCELERATION = 900;
const DASH_ACCELERATION = 1400;
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

const status = document.querySelector<HTMLParagraphElement>('#status')!;
const scoreHud = document.querySelector<HTMLElement>('#score')!;
const coinHud = document.querySelector<HTMLElement>('#coin-count')!;
const hpHud = document.querySelector<HTMLElement>('#hp')!;
const result = document.querySelector<HTMLElement>('#result')!;
const resultTitle = document.querySelector<HTMLElement>('#result-title')!;
const resultStats = document.querySelector<HTMLElement>('#result-stats')!;
const stageHud = document.querySelector<HTMLElement>('#stage-label')!;
const nextButton = document.querySelector<HTMLButtonElement>('#result-next')!;
const controls = { left: new Set<number>(), right: new Set<number>(), jump: new Set<number>(), dash: new Set<number>() };
let jumpQueued = false;

function clearControls() {
  Object.values(controls).forEach((pointers) => pointers.clear());
  document.querySelectorAll('.pressed').forEach((button) => button.classList.remove('pressed'));
  jumpQueued = false;
}

document.querySelectorAll<HTMLButtonElement>('[data-control]').forEach((button) => {
  const control = button.dataset.control as keyof typeof controls;
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
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

class Stage extends Phaser.Scene {
  private stageIndex = 0;
  private playerVisual!: Phaser.GameObjects.Sprite;
  private playerPose: PlayerPose | '' = '';
  private audio!: GameAudio;
  private effects!: GameEffects;
  private wasGrounded = false;
  private lastVerticalSpeed = 0;
  private resultTimer?: Phaser.Time.TimerEvent;
  private visuals: { source: Phaser.GameObjects.Shape; sprite: Phaser.GameObjects.Sprite; offsetY: number; flip: boolean }[] = [];
  private player!: Phaser.GameObjects.Rectangle;
  private body!: Phaser.Physics.Arcade.Body;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private finished = false;
  private deaths = 0;
  private coins!: Phaser.Physics.Arcade.StaticGroup;
  private coinCount = 0;
  private enemyScore = 0;
  private hp = MAX_HP;
  private invulnerableUntil = 0;
  private knockbackUntil = 0;
  private checkpointActive = false;
  private checkpoint!: Phaser.GameObjects.Rectangle;
  private checkpointFlag!: Phaser.GameObjects.Triangle;
  private boostUntil = 0;
  private facing = 1;
  private specialPads: { sprite: Phaser.GameObjects.Rectangle; kind: 'spring' | 'boost'; triggered: boolean }[] = [];
  private movingPlatforms: { sprite: Phaser.GameObjects.Rectangle; body: Phaser.Physics.Arcade.Body; axis: 'x' | 'y'; min: number; max: number; x: number; y: number }[] = [];
  private enemies: { sprite: Phaser.GameObjects.Rectangle; body: Phaser.Physics.Arcade.Body; min: number; max: number; spawnX: number }[] = [];

  init(data: { stageIndex?: number; hp?: number; coinCount?: number; enemyScore?: number }) {
    this.stageIndex = data.stageIndex ?? 0;
    this.hp = data.hp ?? MAX_HP;
    this.coinCount = data.coinCount ?? 0;
    this.enemyScore = data.enemyScore ?? 0;
    this.finished = false;
    this.deaths = 0;
    this.checkpointActive = false;
    this.invulnerableUntil = 0;
    this.knockbackUntil = 0;
    this.boostUntil = 0;
    this.facing = 1;
    this.specialPads = [];
    this.movingPlatforms = [];
    this.enemies = [];
    this.visuals = [];
    this.playerPose = '';
    this.wasGrounded = false;
    this.lastVerticalSpeed = 0;
    this.resultTimer = undefined;
    clearControls();
    result.hidden = true;
    nextButton.hidden = true;
  }

  private updateScore() {
    scoreHud.textContent = String(this.coinCount * COIN_SCORE + this.enemyScore);
    coinHud.textContent = String(this.coinCount);
    hpHud.textContent = `${this.hp} / ${MAX_HP}`;
  }

  create() {
    createTextures(this);
    const stage = STAGES[this.stageIndex];
    this.audio = new GameAudio(stage.theme);
    this.effects = new GameEffects(this);
    this.cameras.main.setZoom(1);
    const theme = THEMES[stage.theme];
    document.body.style.setProperty('--accent', theme.accent);
    document.body.dataset.theme = String(stage.theme);
    const checkpoint = stage.checkpoint;
    const goalX = stage.width - 130;
    stageHud.textContent = `STAGE ${this.stageIndex + 1} / ${STAGES.length}`;
    status.textContent = `${stage.name} · ← → / A D 이동 · Space 점프 · Shift 대시`;
    this.physics.resume();
    this.physics.world.setBounds(0, -200, stage.width, 1100);
    createBackground(this, stage.theme, stage.width);

    const ground = this.physics.add.staticGroup();
    const platform = (x: number, y: number, width: number, height: number) => {
      const block = this.add.rectangle(x, y, width, height, theme.soil, 0);
      this.physics.add.existing(block, true);
      ground.add(block);
      this.add.tileSprite(x, y, width, height, `terrain-${stage.theme}`);
      const trim = this.add.graphics();
      trim.fillStyle(theme.top);
      trim.fillRoundedRect(x - width / 2, y - height / 2, width, 8, 3);
      trim.fillStyle(theme.top, 0.65);
      for (let dx = 8; dx < width; dx += 28) trim.fillTriangle(x - width / 2 + dx, y - height / 2 + 6, x - width / 2 + dx + 5, y - height / 2 + 13, x - width / 2 + dx + 11, y - height / 2 + 6);
    };
    stage.platforms.forEach(([x, y, width, height]) => platform(x, y, width, height));

    this.coins = this.physics.add.staticGroup();
    for (const [x, y] of stage.coins) {
      const coin = this.add.circle(x, y, 11, 0xffd35a).setStrokeStyle(3, 0xffedac);
      this.physics.add.existing(coin, true);
      this.coins.add(coin);
      this.attachVisual(coin, 'coin-0', 28, 28).play('coin-spin');
    }
    this.updateScore();

    const hazards = this.physics.add.staticGroup();
    for (const x of stage.spikes) {
      const spike = this.add.triangle(x, 465, 0, 30, 18, 0, 36, 30, 0xff6f80);
      this.physics.add.existing(spike, true);
      hazards.add(spike);
      (spike.body as Phaser.Physics.Arcade.StaticBody).setSize(24, 24).setOffset(6, 6);
      this.attachVisual(spike, 'spike-art', 36, 30);
    }

    this.add.rectangle(goalX, 420, 6, 120, 0xeaf2ff);
    this.add.triangle(goalX + 27, 378, 0, 0, 48, 18, 0, 36, 0x60dfb1);
    this.add.text(goalX - 42, 330, 'GOAL', { fontSize: '16px', color: '#60dfb1' });
    const goal = this.add.rectangle(goalX, 420, 44, 120, 0x60dfb1, 0.12);
    this.physics.add.existing(goal, true);
    this.checkpoint = this.add.rectangle(checkpoint.x, 430, 8, 100, CHECKPOINT_INACTIVE);
    this.checkpointFlag = this.add.triangle(checkpoint.x + 23, 396, 0, 0, 38, 14, 0, 28, CHECKPOINT_INACTIVE);
    this.add.text(checkpoint.x - 50, 356, 'CHECKPOINT', { fontSize: '13px', color: '#bad0e4' });
    this.physics.add.existing(this.checkpoint, true);
    this.player = this.add.rectangle(START.x, START.y, 30, 42, 0x69b9ff).setDepth(2);
    this.player.setStrokeStyle(3, 0xc1e7ff);
    this.playerVisual = this.attachVisual(this.player, 'moss-idle-0', 48, 64, -11).setDepth(4);
    this.physics.add.existing(this.player);
    this.body = this.player.body as Phaser.Physics.Arcade.Body;
    this.body.setMaxVelocity(DASH_SPEED * BOOST_MULTIPLIER, 900);
    for (const [x, kind] of stage.pads) {
      const color = kind === 'spring' ? 0xffa855 : 0x42dfff;
      const sprite = this.add.rectangle(x, 472, 66, 16, color).setStrokeStyle(2, 0xffffff);
      this.physics.add.existing(sprite, true);
      const pad = { sprite, kind, triggered: false };
      this.specialPads.push(pad);
      this.attachVisual(sprite, `${kind}-art`, 66, 16);
      this.add.text(x, 500, kind === 'spring' ? 'SPRING ↑' : 'BOOST »', { fontSize: '12px', color: kind === 'spring' ? '#ffa855' : '#42dfff' }).setOrigin(0.5);
      this.physics.add.collider(this.player, sprite, () => {
        if (this.finished || pad.triggered || !this.body.touching.down || this.body.velocity.y < 0 || this.time.now < this.knockbackUntil) return;
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
    for (const [min, max] of stage.enemies) {
      const sprite = this.add.rectangle(min, 462, 34, 36, 0xd783ff).setStrokeStyle(3, 0xf2d5ff);
      this.physics.add.existing(sprite);
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false).setVelocityX(ENEMY_SPEED);
      this.enemies.push({ sprite, body, min, max, spawnX: min });
      this.attachVisual(sprite, 'enemy-0', 44, 42, -3, true).play('enemy-walk');
    }
    this.physics.add.overlap(this.player, this.enemies.map((enemy) => enemy.sprite), (_player, object) => {
      this.hitEnemy(object as Phaser.GameObjects.Rectangle);
    });
    this.physics.add.collider(this.player, ground);
    this.physics.add.overlap(this.player, this.checkpoint, () => {
      if (this.finished || this.checkpointActive) return;
      this.checkpointActive = true;
      this.checkpoint.setFillStyle(CHECKPOINT_ACTIVE);
      this.checkpointFlag.setFillStyle(CHECKPOINT_ACTIVE);
      status.textContent = '체크포인트 활성화! 다음 부활은 이곳에서';
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
    this.physics.add.overlap(this.player, goal, () => this.endStage(true));
    this.cameras.main.setBounds(0, 0, stage.width, 600);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.centerOn(START.x, START.y);
    this.keys = this.input.keyboard!.addKeys('LEFT,RIGHT,UP,A,D,W,SPACE,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    this.game.events.on(Phaser.Core.Events.BLUR, this.resetInput, this);
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncVisuals, this);
    const unbindEnvironment = bindAppEnvironment(this, () => this.resetInput(), () => this.audio.pauseForBackground(), () => this.audio.resumeFromBackground());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unbindEnvironment();
      this.game.events.off(Phaser.Core.Events.BLUR, this.resetInput, this);
      this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.syncVisuals, this);
      this.resultTimer?.remove(false);
      this.audio.destroy();
      this.effects.destroy();
    });
    document.querySelector<HTMLButtonElement>('#restart')!.onclick = () => this.restartGame();
    document.querySelector<HTMLButtonElement>('#result-restart')!.onclick = () => this.restartGame();
    nextButton.onclick = () => {
      if (!this.finished || this.hp <= 0 || this.stageIndex >= STAGES.length - 1) return;
      this.resetInput();
      this.finished = false;
      result.hidden = true;
      this.scene.restart({ stageIndex: this.stageIndex + 1, hp: this.hp, coinCount: this.coinCount, enemyScore: this.enemyScore });
    };
  }

  private attachVisual(source: Phaser.GameObjects.Shape, key: string, width: number, height: number, offsetY = 0, flip = false) {
    source.fillAlpha = 0;
    source.strokeAlpha = 0;
    const sprite = this.add.sprite(source.x, source.y + offsetY, key).setDisplaySize(width, height).setDepth(2);
    this.visuals.push({ source, sprite, offsetY, flip });
    return sprite;
  }

  private syncVisuals(_time: number, delta: number) {
    this.effects.update(delta);
    for (const visual of this.visuals) {
      visual.sprite.setPosition(visual.source.x, visual.source.y + visual.offsetY).setVisible(visual.source.visible).setAlpha(visual.source.alpha);
      if (visual.flip && visual.source.active) visual.sprite.setFlipX((visual.source.body as Phaser.Physics.Arcade.Body).velocity.x < 0);
    }
    this.playerVisual.setFlipX(Math.abs(this.body.velocity.x) > 8 ? this.body.velocity.x < 0 : this.facing < 0);
    if (this.finished) { this.playerVisual.anims.pause(); return; }
    const grounded = this.body.blocked.down || this.body.touching.down;
    if (grounded && !this.wasGrounded && this.lastVerticalSpeed > 100 && this.body.velocity.y >= 0) this.audio.play('land');
    this.wasGrounded = grounded;
    this.lastVerticalSpeed = this.body.velocity.y;
    const pose: PlayerPose = this.time.now < this.knockbackUntil ? 'hurt'
      : Math.abs(this.body.velocity.x) > MOVE_SPEED + 15 && (this.keys.SHIFT.isDown || this.time.now < this.boostUntil) ? 'dash'
      : !grounded && this.body.velocity.y <= 0 ? 'jump'
      : !grounded ? 'fall'
      : Math.abs(this.body.velocity.x) > 8 ? 'run' : 'idle';
    if (pose !== this.playerPose) {
      this.playerPose = pose;
      this.playerVisual.play(`moss-${pose}`);
      if (pose === 'dash') this.audio.play('dash');
    }
    if (pose === 'dash') this.effects.trail(this.playerVisual, this.time.now);
    if (this.time.now < this.boostUntil) this.playerVisual.setTint(0xb3fff0);
    else this.playerVisual.clearTint();
  }

  private resetInput() {
    clearControls();
    this.input.keyboard?.resetKeys();
    this.body.setVelocityX(0);
  }

  private restartGame() {
    this.resetInput();
    this.finished = true;
    result.hidden = true;
    this.scene.restart({ stageIndex: 0, hp: MAX_HP, coinCount: 0, enemyScore: 0 });
  }

  private respawn() {
    if (this.finished) return;
    this.deaths += 1;
    const spawn = this.checkpointActive ? STAGES[this.stageIndex].checkpoint : START;
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
    this.hp -= 1;
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
      sprite.setActive(false);
      enemyBody.enable = false;
      enemyBody.setVelocity(0, 0);
      this.enemyScore += ENEMY_SCORE;
      this.audio.play('enemy');
      this.effects.burst(sprite.x, sprite.y, 0xe4b6ff, 12, 135);
      this.updateScore();
      const velocityX = this.body.velocity.x;
      this.body.reset(this.player.x, enemyBody.top - this.body.halfHeight - 1);
      this.body.setVelocity(velocityX, -STOMP_BOUNCE);
      this.tweens.add({ targets: sprite, x: sprite.x + (this.player.x < sprite.x ? 30 : -30), y: sprite.y - 24, alpha: 0, duration: 180, onComplete: () => sprite.setVisible(false) });
      return;
    }
    this.takeHit(sprite.x);
  }

  private endStage(cleared: boolean) {
    if (this.finished) return;
    this.finished = true;
    this.resetInput();
    this.body.setVelocity(0, 0);
    this.player.setAlpha(1);
    this.physics.pause();
    this.audio.stopMusic();
    const allCleared = cleared && this.stageIndex === STAGES.length - 1;
    resultTitle.textContent = cleared ? (allCleared ? 'ALL CLEAR!' : 'STAGE CLEAR!') : 'GAME OVER';
    status.textContent = cleared ? (allCleared ? '전체 스테이지 클리어! 축하합니다' : `Stage ${this.stageIndex + 1} 클리어!`) : 'HP가 모두 소진되었습니다';
    resultStats.textContent = `점수 ${this.coinCount * COIN_SCORE + this.enemyScore}점 · 코인 ${this.coinCount}개`;
    nextButton.hidden = !cleared || allCleared;
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
    const keyboardJump = ['UP', 'W', 'SPACE'].map((key) => Phaser.Input.Keyboard.JustDown(this.keys[key])).some(Boolean);
    const jump = keyboardJump || jumpQueued;
    jumpQueued = false;
    if (this.finished) return;
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
    for (const enemy of this.enemies) {
      if (!enemy.sprite.active) continue;
      if (enemy.sprite.x <= enemy.min) {
        enemy.body.reset(enemy.min, 462);
        enemy.body.setVelocityX(ENEMY_SPEED);
      } else if (enemy.sprite.x >= enemy.max) {
        enemy.body.reset(enemy.max, 462);
        enemy.body.setVelocityX(-ENEMY_SPEED);
      }
    }
    const left = this.keys.LEFT.isDown || this.keys.A.isDown || controls.left.size > 0;
    const right = this.keys.RIGHT.isDown || this.keys.D.isDown || controls.right.size > 0;
    const direction = Number(right) - Number(left);
    if (direction !== 0) this.facing = direction;
    const dash = this.keys.SHIFT.isDown || controls.dash.size > 0;
    const boosted = this.time.now < this.boostUntil;
    const targetSpeed = direction * (dash ? DASH_SPEED : MOVE_SPEED) * (boosted ? BOOST_MULTIPLIER : 1);
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
    width: Math.max(320, Math.round(window.innerWidth / window.innerHeight * 600)),
    height: 600,
  },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 1100 } } },
  audio: { noAudio: true },
  scene: Stage,
});
game.events.once(Phaser.Core.Events.DESTROY, closeAudio);

const resize = () => {
  const parent = document.querySelector<HTMLElement>('#game')!;
  game.scale.setGameSize(Math.max(320, Math.round(parent.clientWidth / Math.max(1, parent.clientHeight) * 600)), 600);
};
new ResizeObserver(resize).observe(document.querySelector('#game')!);
