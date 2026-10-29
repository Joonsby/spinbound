import Phaser from 'phaser';

// The world is always 600 logical px tall; the canvas is `renderScale` times larger on dense screens
// and every camera multiplies its zoom by it, so gameplay coordinates never change.
export const LOGICAL_HEIGHT = 600;
export const RENDER_SCALE_EVENT = 'render-scale';
export const APPLY_DISPLAY_EVENT = 'apply-display';

let renderScale = 1;

export function getRenderScale() { return renderScale; }
export function setRenderScale(value: number) { renderScale = value; }

// Text is rasterised at the render scale so labels stay sharp.
export function addLabel(scene: Phaser.Scene, x: number, y: number, text: string, style: Phaser.Types.GameObjects.Text.TextStyle) {
  return scene.add.text(x, y, text, { ...style, resolution: renderScale });
}
