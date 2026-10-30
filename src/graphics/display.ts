import Phaser from 'phaser';

// The world is always 600 logical px tall; the canvas is `renderScale` times larger on dense screens
// and every camera multiplies its zoom by it, so gameplay coordinates never change.
export const LOGICAL_HEIGHT = 600;
export const RENDER_SCALE_EVENT = 'render-scale';
export const APPLY_DISPLAY_EVENT = 'apply-display';

let renderScale = 1;
let viewZoom = 1;

// Short screens (a phone held sideways) show less of the 600px world so the action reads bigger.
// The visible height is ~1.3 logical px per CSS px, never under 400 or over the full 600.
export const viewZoomFor = (cssHeight: number) => LOGICAL_HEIGHT / Math.min(LOGICAL_HEIGHT, Math.max(400, cssHeight * 1.3));
export function getViewZoom() { return viewZoom; }
export function setViewZoom(value: number) { viewZoom = value; }

export function getRenderScale() { return renderScale; }
export function setRenderScale(value: number) { renderScale = value; }

// Text is rasterised at the render scale so labels stay sharp.
export function addLabel(scene: Phaser.Scene, x: number, y: number, text: string, style: Phaser.Types.GameObjects.Text.TextStyle) {
  return scene.add.text(x, y, text, { ...style, resolution: renderScale });
}
