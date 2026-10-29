import Phaser from 'phaser';
import { PHYSICS } from './config';
import { getRenderScale, LOGICAL_HEIGHT } from '../graphics/display';

const MIN_LEAD = 60;
const MAX_LEAD_RATIO = 0.24;
const LEAD_RESPONSE = 2.4;
// Speed zoom-out stays subtle so obstacles keep their on-screen size.
const SPEED_ZOOM_MIN = 0.92;
const ZOOM_RESPONSE = 1.6;

// Owns the main camera: look-ahead, speed zoom, the clear zoom-in and the render-scale multiplier.
// Purely visual; physics never reads the camera.
export class CameraController {
  private lead = MIN_LEAD;
  private direction = 1;
  private zoom = 1;
  private celebrateZoom = 1;

  constructor(private camera: Phaser.Cameras.Scene2D.Camera, private target: Phaser.GameObjects.Components.Transform, private worldWidth: number) {}

  // Visible logical size at the current zoom.
  get viewWidth() { return this.camera.width / getRenderScale() / this.zoom; }
  get viewHeight() { return this.camera.height / getRenderScale() / this.zoom; }

  follow(x: number, y: number) {
    this.zoom = 1;
    this.camera.startFollow(this.target, true, 1, 1);
    this.apply();
    this.snap(x, y, this.direction);
  }

  snap(x: number, y: number, facing: number) {
    this.direction = facing;
    this.lead = facing * MIN_LEAD;
    this.camera.setFollowOffset(-this.lead, 0);
    this.camera.centerOn(x + this.lead, y);
  }

  celebrate(scene: Phaser.Scene) {
    scene.tweens.add({ targets: this, celebrateZoom: 1.15, duration: 450, ease: 'Sine.easeOut', onUpdate: () => this.apply() });
  }

  // Re-apply zoom and bounds (also after a render-scale change).
  apply() {
    const camera = this.camera;
    const zoom = this.zoom * this.celebrateZoom;
    const viewHeight = LOGICAL_HEIGHT / Math.min(1, zoom);
    // Bottom-anchored: zooming out reveals sky above, never empty space under the floor.
    camera.setZoom(zoom * getRenderScale()).setBounds(0, LOGICAL_HEIGHT - viewHeight, this.worldWidth, viewHeight);
  }

  update(deltaMs: number, vx: number, facing: number) {
    const dt = Math.min(deltaMs, PHYSICS.maxStepMs) / 1000;
    const speed = Math.abs(vx);
    // Ignore brief wobbles near zero so turning in place does not swing the view.
    if (speed > 60) this.direction = Math.sign(vx);
    else if (speed < 5) this.direction = facing;
    const intensity = Phaser.Math.Clamp((speed - 100) / (PHYSICS.boostSpeed - 100), 0, 1);
    const maxLead = this.viewWidth * MAX_LEAD_RATIO;
    const goal = this.direction * (MIN_LEAD + (maxLead - MIN_LEAD) * intensity);
    this.lead += (goal - this.lead) * (1 - Math.exp(-dt * LEAD_RESPONSE));
    this.camera.setFollowOffset(-this.lead, 0);
    const zoomGoal = 1 - (1 - SPEED_ZOOM_MIN) * Phaser.Math.Clamp((speed - PHYSICS.runSpeed) / (PHYSICS.boostSpeed - PHYSICS.runSpeed), 0, 1);
    const nextZoom = this.zoom + (zoomGoal - this.zoom) * (1 - Math.exp(-dt * ZOOM_RESPONSE));
    if (Math.abs(nextZoom - this.zoom) > 0.0005) { this.zoom = nextZoom; this.apply(); }
  }
}
