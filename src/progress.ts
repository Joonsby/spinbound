import type { QualitySetting } from './graphics/quality';

export const ROBOTS = [{ id: 'orange-01', name: '오렌지-01', texture: 'robot-portrait', blinkTexture: 'robot-portrait-blink' }];
const QUALITY_SETTINGS: QualitySetting[] = ['auto', 'low', 'medium', 'high'];
export const ITEMS: Record<string, string> = { 'repair-kit': '수리 키트', 'energy-cell': '에너지 셀' };
export type PlayerProgress = {
  version: 1;
  level: number;
  currency: number;
  // maxEnergy is unused since flight was removed; kept so older saves round-trip.
  stats: { attack: number; defense: number; maxHp: number; maxEnergy: number };
  ownedCharacters: string[];
  equippedCharacter: string;
  unlockedStage: number;
  items: string[];
  soundEnabled: boolean;
  graphicsQuality: QualitySetting;
};
const KEY = 'sprout-hop:player-progress:v1';
let progress: PlayerProgress | undefined;
const defaults = (): PlayerProgress => ({ version: 1, level: 1, currency: 0, stats: { attack: 10, defense: 0, maxHp: 3, maxEnergy: 100 }, ownedCharacters: ['orange-01'], equippedCharacter: 'orange-01', unlockedStage: 1, items: [], soundEnabled: true, graphicsQuality: 'auto' });
const number = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback;
function recover(value: unknown): PlayerProgress {
  const base = defaults();
  if (!value || typeof value !== 'object') return base;
  const data = value as Partial<PlayerProgress>;
  if (data.version !== 1) return base;
  const owned = Array.isArray(data.ownedCharacters) ? ROBOTS.filter((robot) => data.ownedCharacters!.includes(robot.id)).map((robot) => robot.id) : [];
  if (!owned.includes(base.equippedCharacter)) owned.unshift(base.equippedCharacter);
  return {
    version: 1, level: number(data.level, 1, 1, 999), currency: number(data.currency, 0, 0, 999999999),
    stats: { attack: number(data.stats?.attack, 10, 1, 10000), defense: number(data.stats?.defense, 0, 0, 80), maxHp: number(data.stats?.maxHp, 3, 1, 1000), maxEnergy: number(data.stats?.maxEnergy, 100, 1, 10000) },
    ownedCharacters: owned, equippedCharacter: typeof data.equippedCharacter === 'string' && owned.includes(data.equippedCharacter) ? data.equippedCharacter : base.equippedCharacter,
    unlockedStage: number(data.unlockedStage, 1, 1, 10),
    items: Array.isArray(data.items) ? data.items.filter((item): item is string => typeof item === 'string' && Object.hasOwnProperty.call(ITEMS, item)).slice(0, 500) : [],
    soundEnabled: typeof data.soundEnabled === 'boolean' ? data.soundEnabled : true,
    graphicsQuality: QUALITY_SETTINGS.includes(data.graphicsQuality as QualitySetting) ? data.graphicsQuality as QualitySetting : 'auto',
  };
}
export function savePlayerProgress(value: PlayerProgress) {
  progress = recover(value);
  try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch { /* Storage may be unavailable; keep in-memory progress. */ }
}
export function getPlayerProgress(): PlayerProgress {
  if (!progress) {
    let stored: unknown;
    try { stored = JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { stored = null; }
    savePlayerProgress(recover(stored));
  }
  return progress!;
}
export function getEquippedRobot() { return ROBOTS.find((robot) => robot.id === getPlayerProgress().equippedCharacter) ?? ROBOTS[0]; }
export function unlockNextStage(completed: number, total: number) {
  const data = getPlayerProgress();
  data.unlockedStage = Math.max(data.unlockedStage, Math.min(total, completed + 1));
  savePlayerProgress(data);
}
