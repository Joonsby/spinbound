import Phaser from 'phaser';
import { artScale, seeded } from './art';
import { decoKey, LEDGE, terrainKey, TOP_BAND } from './scenery-art';
import { DEPTH } from './depth';
import { quality } from './quality';
import type { StageTheme } from './themes';

export type Rect = { left: number; right: number; top: number; bottom: number };

const SIDE_WIDTH = 14;
const SCREEN_BOTTOM = 600;

export const toRect = ([x, y, width, height]: [number, number, number, number]): Rect =>
  ({ left: x - width / 2, right: x + width / 2, top: y - height / 2, bottom: y + height / 2 });

// Visual dressing for the existing collision rectangles. Nothing here touches physics:
// the only overhang is grass blades drawn up to TOP_BAND.surface px above a top edge.
export function buildTerrain(scene: Phaser.Scene, theme: StageTheme, solids: Rect[], ledges: Rect[], avoid: number[]) {
  const key = (part: string) => terrainKey(theme, part);
  const tile = (x: number, y: number, width: number, height: number, part: string, depth: number, alignX = x, alignY = y) => {
    const scale = artScale(key(part));
    return scene.add.tileSprite(x, y, width, height, key(part)).setOrigin(0, 0).setDepth(depth)
      .setTileScale(1 / scale).setTilePosition(alignX * scale, alignY * scale);
  };
  // Exposed height of a side: the part not covered by a neighbour that is at least as high.
  const exposed = (rect: Rect, edge: number, facing: 'left' | 'right') => {
    let cover = rect.bottom;
    for (const other of solids) {
      if (other === rect || other.bottom <= rect.top || other.top >= rect.bottom) continue;
      const touches = facing === 'left' ? Math.abs(other.right - edge) < 1 : Math.abs(other.left - edge) < 1;
      if (touches) cover = Math.min(cover, Math.max(rect.top, other.top));
    }
    return cover - rect.top;
  };

  for (const rect of solids) {
    const width = rect.right - rect.left;
    const height = rect.bottom - rect.top;
    tile(rect.left, rect.top, width, height, 'soil', DEPTH.terrain);
    scene.add.image(rect.left, rect.top + 12, key('shade')).setOrigin(0, 0).setDepth(DEPTH.terrain + 0.1)
      .setDisplaySize(width, Math.max(1, Math.min(height, SCREEN_BOTTOM - rect.top) - 12));
    for (const side of ['left', 'right'] as const) {
      const edge = side === 'left' ? rect.left : rect.right;
      const visible = exposed(rect, edge, side);
      if (visible <= 0) continue;
      // Vertically uniform art, so a stretched image (no repeat seam) is enough.
      scene.add.image(side === 'left' ? rect.left : rect.right - SIDE_WIDTH, rect.top + 8, key(side === 'left' ? 'side' : 'side-right'))
        .setOrigin(0, 0).setDepth(DEPTH.terrain + 0.2).setDisplaySize(SIDE_WIDTH, Math.max(1, visible - 8));
      const corner = scene.add.image(side === 'left' ? rect.left - 2.4 : rect.right + 2.4, rect.top - TOP_BAND.surface, key('corner'))
        .setOrigin(0, 0).setDepth(DEPTH.terrainTop + 0.1).setFlipX(side === 'right');
      corner.setScale(1 / artScale(key('corner')));
      if (side === 'right') corner.setOrigin(1, 0);
    }
    tile(rect.left, rect.top - TOP_BAND.surface, width, TOP_BAND.height, 'top', DEPTH.terrainTop, rect.left, 0);
    const supported = solids.some((other) => other !== rect && Math.abs(other.top - rect.bottom) < 1 && other.left < rect.right && other.right > rect.left);
    if (rect.bottom < SCREEN_BOTTOM && !supported) tile(rect.left, rect.bottom - 10, width, 18, 'under', DEPTH.terrain + 0.3, rect.left, 0);
  }

  for (const rect of ledges) {
    const width = rect.right - rect.left;
    tile(rect.left, rect.top - LEDGE.top, width, LEDGE.height, 'ledge', DEPTH.terrainTop, rect.left, 0);
    for (const side of ['left', 'right'] as const) {
      const cap = scene.add.image(side === 'left' ? rect.left - 4 : rect.right + 4, rect.top - LEDGE.top, key('ledge-cap'))
        .setOrigin(side === 'left' ? 0 : 1, 0).setFlipX(side === 'right').setDepth(DEPTH.terrainTop + 0.1);
      cap.setScale(1 / artScale(key('ledge-cap')));
    }
  }

  if (!quality().decorations) return;
  // Small scenery on open floor, kept clear of hazards and pads so nothing gameplay-relevant is hidden.
  const rng = seeded(solids.length * 977 + Math.round(solids[0]?.left ?? 0));
  const kinds = ['tuft', 'tuft', 'flower', 'rock'];
  for (const rect of solids) {
    for (let x = rect.left + 24; x < rect.right - 24; x += 70 + rng() * 120) {
      if (avoid.some((spot) => Math.abs(spot - x) < 60)) continue;
      const kind = kinds[Math.floor(rng() * kinds.length)];
      const decoration = scene.add.image(x, rect.top + 2, decoKey(theme, kind)).setOrigin(0.5, 1).setDepth(DEPTH.decoration);
      decoration.setScale((0.9 + rng() * 0.4) / artScale(decoKey(theme, kind))).setFlipX(rng() < 0.5);
    }
  }
}
