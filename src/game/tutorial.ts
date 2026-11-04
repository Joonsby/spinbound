// One-time hints already shown on this device (hint keys: stage 1 section keys and ENCOUNTER_HINTS).
// Device-only like the sound setting; settings and the pause menu can clear it to show the hints again.
const KEY = 'spinbound:hints-seen:v1';
// Stage 1 used to pause on a tip card per section; those indexes no longer mean anything.
const OLD_KEY = 'spinbound:tutorial-seen:v1';

export function seenHints(): Set<string> {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(stored) ? stored.filter((key): key is string => typeof key === 'string') : []);
  } catch { return new Set(); }
}

export function markHintsSeen(keys: string[]) {
  const seen = seenHints();
  for (const key of keys) seen.add(key);
  try { localStorage.setItem(KEY, JSON.stringify([...seen])); } catch { /* storage unavailable */ }
}

export function resetHints() {
  try { localStorage.removeItem(KEY); localStorage.removeItem(OLD_KEY); } catch { /* storage unavailable */ }
}

// Short lines for a mechanic the first time it comes into view on a stage without its own hints.
export const ENCOUNTER_HINTS = {
  boost: '부스터를 밟으면 굴러서 공격해요',
  spring: '스프링을 밟으면 높이 튀어 올라요',
  platform: '발판이 가장자리에 붙을 때 올라타요',
  rope: '점프로 줄을 잡고 · 점프로 놓아요',
  wall: '구르며 금 간 벽에 부딪히면 부서져요',
  fly: '나는 적은 위에서 밟아 처치해요',
  hopper: '뛰는 적은 내려앉은 순간을 노려요',
  charger: '돌진이 끝난 직후가 공격 기회예요',
} as const;
export type EncounterKey = keyof typeof ENCOUNTER_HINTS;

type EncounterSource = {
  pads: [number, string, number?][];
  movingPlatforms: { x: number; y: number }[];
  ropes?: { x: number; y: number; length: number }[];
  walls?: { x: number; y: number }[];
  enemyDetails?: { kind: string; x: number; y: number }[];
};

// Where each mechanic first shows up in a stage; the hint fires when that spot comes into view.
export function encounterSpots(stage: EncounterSource) {
  const spots: { key: EncounterKey; x: number; y: number }[] = [];
  const add = (key: EncounterKey, point: { x: number; y: number } | undefined) => { if (point) spots.push({ key, x: point.x, y: point.y }); };
  const pad = (kind: (padKind: string) => boolean) => stage.pads.filter(([, padKind]) => kind(padKind)).map(([x, , y = 472]) => ({ x, y }))[0];
  add('boost', pad((kind) => kind === 'boost'));
  add('spring', pad((kind) => kind !== 'boost'));
  add('platform', stage.movingPlatforms[0]);
  const rope = stage.ropes?.[0];
  add('rope', rope && { x: rope.x, y: rope.y + rope.length / 2 });
  add('wall', stage.walls?.[0]);
  for (const kind of ['fly', 'hopper', 'charger'] as const) add(kind, stage.enemyDetails?.find((enemy) => enemy.kind === kind));
  return spots;
}
