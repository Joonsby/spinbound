import type { QualitySetting } from './graphics/quality';
import { buyItem as payForItem, takeItems } from './game/economy';

export const ROBOTS = [{ id: 'orange-01', name: '오렌지-01', texture: 'robot-portrait', blinkTexture: 'robot-portrait-blink' }];
const QUALITY_SETTINGS: QualitySetting[] = ['auto', 'low', 'medium', 'high'];
// Single-stage items bought with coins before a stage; each start uses one of every chosen item.
export const ITEMS = {
  shield: { name: '보호막', description: '첫 피격 1회를 막아요', price: 30 },
  'extra-heart': { name: '추가 하트', description: '이번 판 최대 HP +1', price: 40 },
  magnet: { name: '코인 자석', description: '가까운 코인을 끌어와요', price: 25 },
} as const;
export type ItemId = keyof typeof ITEMS;
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
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
// Validates progress from outside the game (the cloud copy); bad fields fall back to defaults.
export const recoverPlayerProgress = (value: unknown) => recover(value);
let savedListener: ((value: PlayerProgress) => void) | undefined;
export function onPlayerProgressSaved(listener: (value: PlayerProgress) => void) { savedListener = listener; }
export function savePlayerProgress(value: PlayerProgress) {
  progress = recover(value);
  try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch { /* Storage may be unavailable; keep in-memory progress. */ }
  savedListener?.(progress);
}
export function getPlayerProgress(): PlayerProgress {
  if (!progress) {
    let stored: unknown;
    try { stored = JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { stored = null; }
    savePlayerProgress(recover(stored));
  }
  return progress!;
}
export function addCurrency(amount: number) {
  const data = getPlayerProgress();
  data.currency += amount;
  savePlayerProgress(data);
  return getPlayerProgress().currency;
}
export const itemCount = (id: ItemId) => getPlayerProgress().items.filter((item) => item === id).length;
export function buyItem(id: ItemId) {
  const data = getPlayerProgress();
  if (!payForItem(data, id, ITEMS[id].price)) return false;
  savePlayerProgress(data);
  return true;
}
// Removes one of each chosen item from the bag; returns the ones actually used.
export function useItems(chosen: readonly ItemId[]) {
  const data = getPlayerProgress();
  const used = takeItems(data.items, chosen) as ItemId[];
  if (used.length) savePlayerProgress(data);
  return used;
}
// Returns false (and spends nothing) when the balance is too low.
export function spendCurrency(amount: number) {
  const data = getPlayerProgress();
  if (data.currency < amount) return false;
  data.currency -= amount;
  savePlayerProgress(data);
  return true;
}
export function getEquippedRobot() { return ROBOTS.find((robot) => robot.id === getPlayerProgress().equippedCharacter) ?? ROBOTS[0]; }
export function unlockNextStage(completed: number, total: number) {
  const data = getPlayerProgress();
  data.unlockedStage = Math.max(data.unlockedStage, Math.min(total, completed + 1));
  savePlayerProgress(data);
}
