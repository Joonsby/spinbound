import Phaser from 'phaser';
import { PHYSICS } from './config';
import { getRenderScale, getViewZoom, LOGICAL_HEIGHT } from '../graphics/display';

const MIN_LEAD = 60;
const MAX_LEAD_RATIO = 0.24;
const LEAD_RESPONSE = 2.4;
// Speed zoom-out stays subtle so obstacles keep their on-screen size.
const SPEED_ZOOM_MIN = 0.92;
const ZOOM_RESPONSE = 1.6;
// The floor sits this far below the view centre (share of the view height).
const FLOOR_BELOW_CENTER = 0.15;
// The view only leaves the floor to keep the player between these shares of its height.
const KEEP_TOP = 0.25;
const KEEP_BOTTOM = 0.2;

// Owns the main camera: look-ahead, speed zoom, the clear zoom-in and the render-scale multiplier.
// Vertically it rests on the floor the player is on, so jumps and ledges do not lift the view.
// Purely visual; physics never reads the camera.
export class CameraController {
  private lead = MIN_LEAD;
  private direction = 1;
  private zoom = 1;
  private celebrateZoom = 1;
  // Followed point: the player's x and the floor-based height.
  private focus = { x: 0, y: 0 };
  private floor: number | undefined;

  // worldTop < 0 lets the view climb above the usual screen (stages that go up or down).
  constructor(private camera: Phaser.Cameras.Scene2D.Camera, private target: Phaser.GameObjects.Components.Transform, private worldWidth: number, private worldTop = 0) {}

  // Visible logical size at the current zoom.
  get viewWidth() { return this.camera.width / getRenderScale() / this.zoom / this.baseZoom; }
  get viewHeight() { return this.camera.height / getRenderScale() / this.zoom / this.baseZoom; }
  // Screen-size zoom (see viewZoomFor).
  private get baseZoom() { return getViewZoom(); }

  follow(x: number, y: number) {
    this.zoom = 1;
    this.focus.x = x;
    this.focus.y = y;
    this.camera.startFollow(this.focus, true, 1, 1);
    this.apply();
    this.snap(x, y, this.direction);
  }

  snap(x: number, y: number, facing: number) {
    this.direction = facing;
    this.lead = facing * MIN_LEAD;
    this.camera.setFollowOffset(-this.lead, 0);
    this.focus.x = x;
    this.focus.y = y;
    this.camera.centerOn(x + this.lead, y);
  }

  // Top of the floor the player stands on (the route floor, not a ledge or a jump).
  setFloor(top: number) { this.floor = top; }

  celebrate(scene: Phaser.Scene) {
    scene.tweens.add({ targets: this, celebrateZoom: 1.15, duration: 450, ease: 'Sine.easeOut', onUpdate: () => this.apply() });
  }

  // Re-apply zoom and bounds (also after a render-scale change).
  apply() {
    const camera = this.camera;
    const zoom = this.zoom * this.celebrateZoom * this.baseZoom;
    const viewHeight = LOGICAL_HEIGHT / Math.min(1, zoom);
    // Bottom-anchored: zooming out reveals sky above, never empty space under the floor.
    const top = Math.min(this.worldTop, LOGICAL_HEIGHT - viewHeight);
    camera.setZoom(zoom * getRenderScale()).setBounds(0, top, this.worldWidth, LOGICAL_HEIGHT - top);
    // A view shorter than the world scrolls vertically; ease it so jumps do not shake the screen.
    camera.setLerp(1, zoom > 1.01 || this.worldTop < 0 ? 0.12 : 1);
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
    const { x, y } = this.target;
    const view = this.viewHeight;
    const rest = this.floor === undefined ? y : this.floor - view * FLOOR_BELOW_CENTER;
    this.focus.x = x;
    this.focus.y = Phaser.Math.Clamp(rest, y - view * (0.5 - KEEP_BOTTOM), y + view * (0.5 - KEEP_TOP));
    const zoomGoal = 1 - (1 - SPEED_ZOOM_MIN) * Phaser.Math.Clamp((speed - PHYSICS.runSpeed) / (PHYSICS.boostSpeed - PHYSICS.runSpeed), 0, 1);
    const nextZoom = this.zoom + (zoomGoal - this.zoom) * (1 - Math.exp(-dt * ZOOM_RESPONSE));
    if (Math.abs(nextZoom - this.zoom) > 0.0005) { this.zoom = nextZoom; this.apply(); }
  }
}
