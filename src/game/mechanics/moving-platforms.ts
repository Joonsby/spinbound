import Phaser from 'phaser';
import { GIMMICK } from '../config';
import type { Player } from '../player';
import type { VisualSync } from '../visual-sync';
import { PROP_KEYS } from '../../graphics/props-art';
import { DEPTH } from '../../graphics/depth';

export type MovingPlatformConfig = { x: number; y: number; axis: 'x' | 'y'; min: number; max: number; speed?: number };
type Platform = MovingPlatformConfig & { sprite: Phaser.GameObjects.Rectangle; body: Phaser.Physics.Arcade.Body; speed: number };

// One-way moving platforms. Remembers which one the player stands on for take-off momentum.
export class MovingPlatforms {
  private platforms: Platform[] = [];
  private standing?: Platform;
  private standingAt = -Infinity;

  constructor(private scene: Phaser.Scene, configs: MovingPlatformConfig[], visuals: VisualSync, player: Player) {
    for (const config of configs) {
      const sprite = scene.add.rectangle(config.x, config.y, 110, 20, 0x9280ff);
      scene.physics.add.existing(sprite);
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false).setImmovable(true).setFriction(1, 1);
      body.checkCollision.down = false;
      body.checkCollision.left = false;
      body.checkCollision.right = false;
      const speed = config.speed ?? GIMMICK.platformSpeed;
      if (config.axis === 'x') body.setVelocityX(speed);
      else body.setVelocityY(-speed);
      const platform = { ...config, sprite, body, speed };
      this.platforms.push(platform);
      visuals.attach(sprite, PROP_KEYS.flame, 20, 18, 17).setDepth(DEPTH.prop - 0.1);
      visuals.attach(sprite, PROP_KEYS.platform, 110, 22, 1).setDepth(DEPTH.prop);
      // Only the top face collides, so any separation means the player stands on it.
      scene.physics.add.collider(player.sprite, sprite, () => {
        this.standing = platform;
        this.standingAt = scene.time.now;
        player.noteMovingPlatform(scene.time.now);
      });
    }
  }

  update() {
    for (const platform of this.platforms) {
      const position = platform.sprite[platform.axis];
      if (position <= platform.min) platform.body.velocity[platform.axis] = platform.speed;
      else if (position >= platform.max) platform.body.velocity[platform.axis] = -platform.speed;
    }
  }

  // Horizontal speed of the platform under the player, or 0.
  carryVx() {
    return this.standing && this.scene.time.now - this.standingAt < 60 ? this.standing.body.velocity.x : 0;
  }
}
