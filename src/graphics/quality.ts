// Graphics quality presets. Only visuals change with quality; physics and collision never do.

export type QualityLevel = 'low' | 'medium' | 'high';
export type QualitySetting = QualityLevel | 'auto';

export type QualityPreset = {
  // Upper bound for canvas pixels per logical pixel (actual value also depends on screen size × DPR).
  maxRenderScale: number;
  // Texture pixels per logical pixel for code-painted art (@2x art = 2).
  textureScale: number;
  particles: number;
  ghosts: number;
  ambient: number;
  backgroundLayers: number;
  decorations: boolean;
  foreground: boolean;
};

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  low: { maxRenderScale: 1, textureScale: 1, particles: 32, ghosts: 3, ambient: 0, backgroundLayers: 3, decorations: false, foreground: false },
  medium: { maxRenderScale: 1.5, textureScale: 2, particles: 64, ghosts: 5, ambient: 8, backgroundLayers: 4, decorations: true, foreground: true },
  high: { maxRenderScale: 2, textureScale: 2, particles: 96, ghosts: 6, ambient: 16, backgroundLayers: 5, decorations: true, foreground: true },
};

const ORDER: QualityLevel[] = ['low', 'medium', 'high'];
let setting: QualitySetting = 'auto';
let level: QualityLevel = detectQuality();

// Rough device tier; the in-game FPS watchdog lowers it further when needed.
export function detectQuality(): QualityLevel {
  const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency || 4;
  if (memory <= 2 || cores <= 2) return 'low';
  if (memory >= 6 && cores >= 8) return 'high';
  return 'medium';
}

export function configureQuality(value: QualitySetting) {
  setting = value;
  level = value === 'auto' ? detectQuality() : value;
}

export function qualitySetting() { return setting; }
export function qualityLevel() { return level; }
export function quality() { return QUALITY_PRESETS[level]; }

// Auto mode only: step down one level. Returns false when already at the lowest level.
export function downgradeQuality() {
  const index = ORDER.indexOf(level);
  if (setting !== 'auto' || index === 0) return false;
  level = ORDER[index - 1];
  return true;
}

// Canvas pixels per logical pixel for a container of `cssHeight` CSS px showing 600 logical px.
export function renderScaleFor(cssHeight: number, devicePixelRatio = window.devicePixelRatio || 1) {
  const wanted = cssHeight * devicePixelRatio / 600;
  return Math.max(1, Math.min(quality().maxRenderScale, Math.round(wanted * 4) / 4));
}
