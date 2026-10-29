import Phaser from 'phaser';
import { smashesWall, type ContactRules } from '../contact';
import type { Player } from '../player';
import type { VisualSync } from '../visual-sync';

export type WallConfig = { x: number; y: number; width?: number; height?: number };

// Solid until a fast roll hits its side face; the roll then passes through at full speed.
export class BreakableWalls {
  constructor(scene: Phaser.Scene, configs: WallConfig[], visuals: VisualSync, player: Player, rules: ContactRules,
    onBreak: (x: number, y: number, direction: number) => void) {
    if (!configs.length) return;
    const group = scene.physics.add.staticGroup();
    for (const { x, y, width = 36, height = 80 } of configs) {
      const wall = scene.add.rectangle(x, y, width, height, 0xb08a64);
      scene.physics.add.existing(wall, true);
      group.add(wall);
      visuals.attach(wall, 'wall-art', width, height);
    }
    scene.physics.add.collider(player.sprite, group, undefined, (_player, object) => {
      const wall = object as Phaser.GameObjects.Rectangle;
      const body = wall.body as Phaser.Physics.Arcade.StaticBody;
      if (!wall.active) return false;
      if (!smashesWall(player.contactBox(), player.rolling, body, rules)) return true;
      // Break inside the process callback and skip separation so the roll keeps its speed.
      wall.setActive(false).setVisible(false);
      body.enable = false;
      onBreak(wall.x, wall.y, Math.sign(player.body.velocity.x));
      return false;
    });
  }
}
