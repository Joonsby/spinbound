import Phaser from 'phaser';

type Link = { source: Phaser.GameObjects.Shape; sprite: Phaser.GameObjects.Sprite; offsetY: number; flip: boolean; isStatic: boolean; scaleX: number; scaleY: number };

// Physics shapes stay invisible; a textured sprite follows each one.
export class VisualSync {
  private links: Link[] = [];

  constructor(private scene: Phaser.Scene) {}

  attach(source: Phaser.GameObjects.Shape, key: string, width: number, height: number, offsetY = 0, flip = false) {
    source.fillAlpha = 0;
    source.strokeAlpha = 0;
    source.isFilled = false;
    source.isStroked = false;
    const sprite = this.scene.add.sprite(source.x, source.y + offsetY, key).setDisplaySize(width, height).setDepth(2);
    this.links.push({ source, sprite, offsetY, flip, isStatic: source.body instanceof Phaser.Physics.Arcade.StaticBody, scaleX: sprite.scaleX, scaleY: sprite.scaleY });
    return sprite;
  }

  update(view: Phaser.Geom.Rectangle) {
    for (const link of this.links) {
      const { source, sprite } = link;
      if (link.isStatic) {
        sprite.setActive(source.active && source.visible && source.x >= view.left - 96 && source.x <= view.right + 96);
      } else sprite.setPosition(source.x, source.y + link.offsetY).setAngle(source.angle).setScale(link.scaleX * source.scaleX, link.scaleY * source.scaleY);
      sprite.setVisible(source.visible).setAlpha(source.alpha);
      if (link.flip && source.active) sprite.setFlipX((source.body as Phaser.Physics.Arcade.Body).velocity.x < 0);
    }
  }
}
