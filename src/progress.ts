import type { QualitySetting } from './graphics/quality';
import { buyItem as payForItem, buyUpgrade, takeItems } from './game/economy';
import { HP_POINTS, UPGRADES, type StatKey } from './game/config';
import { CHARACTERS, DEFAULT_CHARACTER, characterById, earnedCharacters, type Character } from './characters';

const QUALITY_SETTINGS: QualitySetting[] = ['auto', 'low', 'medium', 'high'];
// Single-stage items bought with coins before a stage; each start uses one of every chosen item.
export const ITEMS = {
  shield: { name: '보호막', description: '첫 피격 1회 방어', price: 30 },
  'extra-heart': { name: '체력 보강', description: `최대 HP +${HP_POINTS}`, price: 40 },
  magnet: { name: '코인 자석', description: '코인 끌어오기', price: 25 },
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
const defaults = (): PlayerProgress => ({ version: 1, level: 1, currency: 0, stats: { attack: 10, defense: 0, maxHp: 3, maxEnergy: 100 }, ownedCharacters: [DEFAULT_CHARACTER.id], equippedCharacter: DEFAULT_CHARACTER.id, unlockedStage: 1, items: [], soundEnabled: true, graphicsQuality: 'auto' });
const number = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback;
function recover(value: unknown): PlayerProgress {
  const base = defaults();
  if (!value || typeof value !== 'object') return base;
  const data = value as Partial<PlayerProgress>;
  if (data.version !== 1) return base;
  const owned = Array.isArray(data.ownedCharacters) ? CHARACTERS.filter((robot) => data.ownedCharacters!.includes(robot.id)).map((robot) => robot.id) : [];
  if (!owned.includes(base.equippedCharacter)) owned.unshift(base.equippedCharacter);
  return {
    version: 1, level: number(data.level, 1, 1, 999), currency: number(data.currency, 0, 0, 999999999),
    stats: { attack: number(data.stats?.attack, 10, 1, 10000), defense: number(data.stats?.defense, 0, 0, 80), maxHp: number(data.stats?.maxHp, 3, 1, 1000), maxEnergy: number(data.stats?.maxEnergy, 100, 1, 10000) },
    ownedCharacters: owned, equippedCharacter: typeof data.equippedCharacter === 'string' && owned.includes(data.equippedCharacter) ? data.equippedCharacter : base.equippedCharacter,
    unlockedStage: number(data.unlockedStage, 1, 1, 999),
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
// Permanent stat upgrade bought in the 강화 menu; false when maxed or too expensive.
export function upgradeStat(stat: StatKey) {
  const data = getPlayerProgress();
  if (!buyUpgrade(data, stat, UPGRADES[stat])) return false;
  savePlayerProgress(data);
  return true;
}
export const itemCount = (id: ItemId) => getPlayerProgress().items.filter((item) => item === id).length;
export function buyItem(id: ItemId) {
  const data = getPlayerProgress();
  if (!payForItem(data, id, ITEMS[id].price)) return false;
  savePlayerProgress(data);
  return true;
}
export function addItems(ids: readonly ItemId[]) {
  const data = getPlayerProgress();
  data.items.push(...ids);
  savePlayerProgress(data);
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
export function getEquippedRobot(): Character { return characterById(getPlayerProgress().equippedCharacter) ?? DEFAULT_CHARACTER; }
export function equipCharacter(id: string) {
  const data = getPlayerProgress();
  if (!data.ownedCharacters.includes(id)) return;
  data.equippedCharacter = id;
  savePlayerProgress(data);
}
// Coin robots only; false when already owned or the balance is too low.
export function buyCharacter(id: string) {
  const data = getPlayerProgress();
  const character = characterById(id);
  if (!character || character.unlock.kind !== 'coins' || data.ownedCharacters.includes(id) || data.currency < character.unlock.price) return false;
  data.currency -= character.unlock.price;
  data.ownedCharacters.push(id);
  savePlayerProgress(data);
  return true;
}
// Adds every robot that the cleared stages have earned and returns the new ones.
export function grantEarnedCharacters() {
  const data = getPlayerProgress();
  const fresh = earnedCharacters(data.unlockedStage).filter((character) => !data.ownedCharacters.includes(character.id));
  if (!fresh.length) return fresh;
  data.ownedCharacters.push(...fresh.map((character) => character.id));
  savePlayerProgress(data);
  return fresh;
}
export function unlockNextStage(completed: number, total: number) {
  const data = getPlayerProgress();
  data.unlockedStage = Math.max(data.unlockedStage, Math.min(total, completed + 1));
  savePlayerProgress(data);
}
