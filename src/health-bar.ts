import Phaser from 'phaser';

// Two reusable shapes per monster; no Graphics redraws or physics bodies.
export class MonsterHealthBar {
  private background: Phaser.GameObjects.Rectangle;
  private fill: Phaser.GameObjects.Rectangle;
  private ratio = -1;
  constructor(scene: Phaser.Scene, private width = 36) {
    this.background = scene.add.rectangle(0, 0, width + 2, 7, 0x1a293a, 0.85).setDepth(8).setVisible(false);
    this.fill = scene.add.rectangle(0, 0, width, 4, 0x91e2b2).setOrigin(0, 0.5).setDepth(9).setVisible(false);
  }
  update(x: number, y: number, hp: number, maxHp: number, visible: boolean) {
    this.background.setVisible(visible); this.fill.setVisible(visible);
    if (!visible) return;
    this.background.setPosition(x, y); this.fill.setPosition(x - this.width / 2, y);
    const ratio = Phaser.Math.Clamp(hp / maxHp, 0, 1);
    if (ratio !== this.ratio) {
      this.ratio = ratio; this.fill.setScale(ratio, 1).setFillStyle(ratio > 0.5 ? 0x91e2b2 : ratio > 0.25 ? 0xffd47e : 0xff8f86);
    }
  }
  hide() { this.background.setVisible(false); this.fill.setVisible(false); }
}
