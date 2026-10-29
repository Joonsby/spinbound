import Phaser from 'phaser';
import { PHYSICS } from './config';

export const PLAYER_POSES = ['idle', 'run', 'jump', 'fall', 'roll', 'hurt', 'dead'] as const;
export type PlayerPose = typeof PLAYER_POSES[number];
export type PoseClip = { frames: number; frameRate: number; repeat: number };

// Clip layout of the procedural robot. A sprite-sheet skin only has to register
// the same `${prefix}-${pose}` animation keys; nothing else reads frame names.
export const ROBOT_CLIPS: Record<PlayerPose, PoseClip> = {
  idle: { frames: 4, frameRate: 4, repeat: -1 },
  run: { frames: 8, frameRate: 48, repeat: -1 },
  jump: { frames: 2, frameRate: 8, repeat: -1 },
  fall: { frames: 2, frameRate: 8, repeat: -1 },
  roll: { frames: 12, frameRate: 24, repeat: -1 },
  hurt: { frames: 2, frameRate: 8, repeat: -1 },
  dead: { frames: 2, frameRate: 4, repeat: 0 },
};

// Physics body and drawn sprite are sized independently.
export const PLAYER_BODY = { width: 30, height: 42 };
export const PLAYER_SPRITE = { width: 48, height: 64, offsetY: -11, rollRadius: 20 };

export const animationKey = (prefix: string, pose: PlayerPose) => `${prefix}-${pose}`;
export const frameKey = (prefix: string, pose: PlayerPose, frame: number) => `${prefix}-${pose}-${frame}`;

export type PoseView = { pose: PlayerPose; speed: number; facing: number; tilt: number; flicker: boolean; boosted: boolean };

// Owns the player sprite: follows the body, picks clips and ties wheel/shell spin to speed.
export class PlayerAnimator {
  readonly sprite: Phaser.GameObjects.Sprite;
  private pose: PlayerPose | '' = '';
  private squash = 1;

  constructor(private scene: Phaser.Scene, private source: Phaser.GameObjects.Rectangle, private prefix: string) {
    this.sprite = scene.add.sprite(source.x, source.y + PLAYER_SPRITE.offsetY, frameKey(prefix, 'idle', 0))
      .setDisplaySize(PLAYER_SPRITE.width, PLAYER_SPRITE.height).setDepth(4);
  }

  // Returns true on the frame the roll begins.
  update(view: PoseView) {
    const { sprite } = this;
    const entered = view.pose === 'roll' && this.pose !== 'roll';
    if (view.pose !== this.pose) {
      this.pose = view.pose;
      sprite.play(animationKey(this.prefix, view.pose));
      if (entered) this.squash = 0.72;
    }
    const clip = ROBOT_CLIPS[view.pose];
    sprite.anims.timeScale = view.pose === 'run'
      ? Phaser.Math.Clamp(view.speed / PHYSICS.runSpeed, 0.1, 2.5)
      // One clip loop is one shell revolution: match it to rolling without slipping.
      : view.pose === 'roll' ? Phaser.Math.Clamp(view.speed / PLAYER_SPRITE.rollRadius / (Math.PI * 2) * clip.frames / clip.frameRate, 0.2, 4)
      : 1;
    this.squash += (1 - this.squash) * 0.25;
    const baseX = PLAYER_SPRITE.width / sprite.width;
    const baseY = PLAYER_SPRITE.height / sprite.height;
    sprite.setScale(baseX * (2 - this.squash), baseY * this.squash);
    sprite.setPosition(this.source.x, this.source.y + PLAYER_SPRITE.offsetY + PLAYER_SPRITE.height * (1 - this.squash) / 2);
    sprite.setAngle(view.tilt);
    sprite.setFlipX(view.facing < 0);
    sprite.setAlpha(view.flicker ? 0.35 : 1);
    if (view.boosted) sprite.setTint(0xb3fff0); else sprite.clearTint();
    return entered;
  }

  freeze() { this.sprite.anims.pause(); }
  resume() { this.sprite.anims.resume(); }
  reset() { this.pose = ''; this.squash = 1; }
}
