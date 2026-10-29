import type { PlayerProgress } from './progress';

// What the cloud copy holds: everything except settings that belong to one device.
export type SyncedProgress = Omit<PlayerProgress, 'soundEnabled' | 'graphicsQuality'>;

export const toSynced = (value: PlayerProgress): SyncedProgress => ({
  version: value.version,
  level: value.level,
  currency: value.currency,
  stats: value.stats,
  ownedCharacters: value.ownedCharacters,
  equippedCharacter: value.equippedCharacter,
  unlockedStage: value.unlockedStage,
  items: value.items,
});

export const sameProgress = (a: PlayerProgress, b: PlayerProgress) => JSON.stringify(toSynced(a)) === JSON.stringify(toSynced(b));

// Each item id kept as many times as the side that has more of it.
function mergeItems(a: string[], b: string[]) {
  const count = (list: string[]) => list.reduce((counts, id) => counts.set(id, (counts.get(id) ?? 0) + 1), new Map<string, number>());
  const countA = count(a);
  const countB = count(b);
  return [...new Set([...a, ...b])].flatMap((id) => Array<string>(Math.max(countA.get(id) ?? 0, countB.get(id) ?? 0)).fill(id));
}

// Progress only grows, so two copies changed on different devices merge by keeping the
// furthest value of each field. Device settings and the equipped robot follow `local`.
export function mergeProgress(local: PlayerProgress, remote: SyncedProgress): PlayerProgress {
  const ownedCharacters = [...new Set([...local.ownedCharacters, ...remote.ownedCharacters])];
  return {
    ...local,
    level: Math.max(local.level, remote.level),
    currency: Math.max(local.currency, remote.currency),
    stats: {
      attack: Math.max(local.stats.attack, remote.stats.attack),
      defense: Math.max(local.stats.defense, remote.stats.defense),
      maxHp: Math.max(local.stats.maxHp, remote.stats.maxHp),
      maxEnergy: Math.max(local.stats.maxEnergy, remote.stats.maxEnergy),
    },
    ownedCharacters,
    equippedCharacter: ownedCharacters.includes(local.equippedCharacter) ? local.equippedCharacter : remote.equippedCharacter,
    unlockedStage: Math.max(local.unlockedStage, remote.unlockedStage),
    items: mergeItems(local.items, remote.items),
  };
}
