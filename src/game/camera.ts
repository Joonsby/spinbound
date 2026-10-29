import Phaser from 'phaser';
import { PHYSICS } from './config';
import { getRenderScale, LOGICAL_HEIGHT } from '../graphics/display';

const MIN_LEAD = 60;
const MAX_LEAD_RATIO = 0.24;
const LEAD_RESPONSE = 2.4;
// Speed zoom-out stays subtle so obstacles keep their on-screen size.
const SPEED_ZOOM_MIN = 0.92;
const ZOOM_RESPONSE = 1.6;
const ARENA_MIN_ZOOM = 0.5;
const ARENA_FLOOR_RATIO = 0.8;

type Arena = { left: number; right: number; ground: number };

// Owns the main camera: look-ahead, speed zoom, boss arena framing and the render-scale multiplier.
// Purely visual; physics never reads the camera.
export class CameraController {
  private lead = MIN_LEAD;
  private direction = 1;
  private zoom = 1;
  private celebrateZoom = 1;
  private arena?: Arena;

  // worldTop < 0 lets the view climb above the usual screen (stages that go up or down).
  constructor(private camera: Phaser.Cameras.Scene2D.Camera, private target: Phaser.GameObjects.Components.Transform, private worldWidth: number, private worldTop = 0) {}

  // Visible logical size at the current zoom.
  get viewWidth() { return this.camera.width / getRenderScale() / this.zoom; }
  get viewHeight() { return this.camera.height / getRenderScale() / this.zoom; }

  follow(x: number, y: number) {
    this.arena = undefined;
    this.zoom = 1;
    this.camera.startFollow(this.target, true, 1, this.worldTop < 0 ? 0.12 : 1);
    this.apply();
    this.snap(x, y, this.direction);
  }

  snap(x: number, y: number, facing: number) {
    this.direction = facing;
    this.lead = facing * MIN_LEAD;
    this.camera.setFollowOffset(-this.lead, 0);
    this.camera.centerOn(x + this.lead, y);
  }

  frameArena(left: number, right: number, ground: number) {
    this.arena = { left, right, ground };
    this.apply();
  }

  release(x: number, y: number) {
    if (!this.arena) return;
    this.follow(x, y);
  }

  celebrate(scene: Phaser.Scene) {
    scene.tweens.add({ targets: this, celebrateZoom: 1.15, duration: 450, ease: 'Sine.easeOut', onUpdate: () => this.apply() });
  }

  // Re-apply zoom and bounds (also after a render-scale change).
  apply() {
    const camera = this.camera;
    if (this.arena) {
      const { left, right, ground } = this.arena;
      const logicalWidth = camera.width / getRenderScale();
      this.zoom = Phaser.Math.Clamp(logicalWidth / (right - left), ARENA_MIN_ZOOM, 1);
      const viewHeight = this.viewHeight;
      const top = Math.min(0, ground - viewHeight * ARENA_FLOOR_RATIO);
      camera.setZoom(this.zoom * getRenderScale()).setBounds(left, top, right - left, Math.max(LOGICAL_HEIGHT, viewHeight));
      if (this.viewWidth >= right - left - 1) { camera.stopFollow(); camera.centerOn((left + right) / 2, top + viewHeight / 2); }
      else camera.startFollow(this.target, true, 1, 1);
      return;
    }
    const zoom = this.zoom * this.celebrateZoom;
    const viewHeight = LOGICAL_HEIGHT / Math.min(1, zoom);
    // Bottom-anchored: zooming out reveals sky above, never empty space under the floor.
    const top = Math.min(this.worldTop, LOGICAL_HEIGHT - viewHeight);
    camera.setZoom(zoom * getRenderScale()).setBounds(0, top, this.worldWidth, LOGICAL_HEIGHT - top);
  }

  update(deltaMs: number, vx: number, facing: number) {
    const dt = Math.min(deltaMs, PHYSICS.maxStepMs) / 1000;
    const speed = Math.abs(vx);
    // Ignore brief wobbles near zero so turning in place does not swing the view.
    if (speed > 60) this.direction = Math.sign(vx);
    else if (speed < 5) this.direction = facing;
    if (this.arena) return;
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
