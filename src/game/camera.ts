import Phaser from 'phaser';
import { PHYSICS } from './config';

const MIN_LEAD = 60;
const MAX_LEAD_RATIO = 0.24;
const LEAD_RESPONSE = 2.4;

// Horizontal look-ahead that grows with speed and eases across direction changes.
// The world is exactly one screen tall, so the camera never scrolls vertically.
export class SpeedCamera {
  private lead = MIN_LEAD;
  private direction = 1;

  constructor(private camera: Phaser.Cameras.Scene2D.Camera, private target: Phaser.GameObjects.Components.Transform) {}

  follow(x: number, y: number) {
    this.camera.startFollow(this.target, true, 1, 1);
    this.snap(x, y, this.direction);
  }

  snap(x: number, y: number, facing: number) {
    this.direction = facing;
    this.lead = facing * MIN_LEAD;
    this.camera.setFollowOffset(-this.lead, 0);
    this.camera.centerOn(x + this.lead, y);
  }

  update(deltaMs: number, vx: number, facing: number) {
    const speed = Math.abs(vx);
    // Ignore brief wobbles near zero so turning in place does not swing the view.
    if (speed > 60) this.direction = Math.sign(vx);
    else if (speed < 5) this.direction = facing;
    const intensity = Phaser.Math.Clamp((speed - 100) / (PHYSICS.boostSpeed - 100), 0, 1);
    const maxLead = this.camera.width / this.camera.zoom * MAX_LEAD_RATIO;
    const goal = this.direction * (MIN_LEAD + (maxLead - MIN_LEAD) * intensity);
    this.lead += (goal - this.lead) * (1 - Math.exp(-Math.min(deltaMs, PHYSICS.maxStepMs) / 1000 * LEAD_RESPONSE));
    this.camera.setFollowOffset(-this.lead, 0);
  }
}
