import Phaser from 'phaser';
import type { PadKind } from '../../stages';
import type { Player } from '../player';
import type { VisualSync } from '../visual-sync';
import { PROP_KEYS } from '../../graphics/props-art';
import { DEPTH } from '../../graphics/depth';
import { addLabel } from '../../graphics/display';

type Pad = { sprite: Phaser.GameObjects.Rectangle; body: Phaser.Physics.Arcade.StaticBody; visual: Phaser.GameObjects.Sprite; kind: PadKind; triggered: boolean };

const LABELS: Record<PadKind, string> = { spring: 'SPRING ↑', 'spring-left': '↖ SPRING', 'spring-right': 'SPRING ↗', boost: 'BOOST »' };
// Feet this far above the pad top still count, so landing on it triggers the same as running into it.
const FOOT_TOLERANCE = 6;

// Springs and boosters are trigger zones, not solid blocks: running into one fires it just like landing on it.
// Each pad fires once and re-arms after the player leaves it.
export class PadSystem {
  private pads: Pad[] = [];

  constructor(private scene: Phaser.Scene, configs: [number, PadKind, number?][], visuals: VisualSync, private player: Player,
    onTrigger: (kind: PadKind, x: number, y: number) => void) {
    for (const [x, kind, padY = 472] of configs) {
      const spring = kind !== 'boost';
      const sprite = scene.add.rectangle(x, padY, 66, 16, 0xffffff);
      scene.physics.add.existing(sprite, true);
      const body = sprite.body as Phaser.Physics.Arcade.StaticBody;
      // Boosters read as a plate set into the floor; springs stand up from it.
      const visual = visuals.attach(sprite, spring ? PROP_KEYS.spring : PROP_KEYS.boost(0), 66, spring ? 26 : 14).setOrigin(0.5, 1).setY(padY + 8 + (spring ? 0 : 3)).setDepth(DEPTH.prop);
      if (!spring) visual.play(PROP_KEYS.boostFlow);
      if (kind === 'spring-left') visual.setAngle(-22);
      if (kind === 'spring-right') visual.setAngle(22);
      const pad: Pad = { sprite, body, visual, kind, triggered: false };
      this.pads.push(pad);
      addLabel(scene, x, padY + 26, LABELS[kind], { fontSize: '11px', fontStyle: 'bold', color: spring ? '#FFD2C2' : '#CFF0FF', stroke: '#2B2236', strokeThickness: 3 }).setOrigin(0.5).setDepth(DEPTH.label);
      scene.physics.add.overlap(player.sprite, sprite, () => {
        const playerBody = player.body;
        if (pad.triggered || player.dead || player.held || player.isHurt(scene.time.now) || playerBody.velocity.y < 0) return;
        if (playerBody.bottom < body.top - FOOT_TOLERANCE || playerBody.bottom > body.bottom + 2) return;
        pad.triggered = true;
        if (spring) this.compress(pad);
        onTrigger(kind, x, padY);
      });
    }
  }

  private compress(pad: Pad) {
    const { visual } = pad;
    const baseY = 26 / visual.height;
    this.scene.tweens.killTweensOf(visual);
    visual.setScale(visual.scaleX, baseY * 0.4);
    this.scene.tweens.add({ targets: visual, scaleY: baseY, duration: 260, ease: 'Back.easeOut' });
  }

  update() {
    const body = this.player.body;
    for (const pad of this.pads) {
      if (!pad.triggered) continue;
      if (body.right <= pad.body.left || body.left >= pad.body.right || body.bottom < pad.body.top - 12) pad.triggered = false;
    }
  }
}
