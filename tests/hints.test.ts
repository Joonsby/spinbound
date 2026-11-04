import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES } from '../src/stages.ts';
import { encounterSpots, ENCOUNTER_HINTS } from '../src/game/tutorial.ts';

test('stage 1 hints every mechanic it uses, so encounter hints are only needed elsewhere', () => {
  const stage = STAGES[0];
  assert.ok(stage.tutorial);
  const taught = new Set((stage.sections ?? []).flatMap((section) => section.keys ?? []));
  for (const spot of encounterSpots(stage)) assert.ok(taught.has(spot.key), `stage 1 uses ${spot.key} without a hint`);
  for (const key of ['dash', 'combo']) assert.ok(taught.has(key), key);
});

test('every hint is short enough for one line of the status pill', () => {
  const lines = [...Object.values(ENCOUNTER_HINTS), ...STAGES.flatMap((stage) => (stage.sections ?? []).map((section) => section.hint))];
  for (const line of lines) assert.ok(line.length <= 26, `${line.length}: ${line}`);
});

test('encounter spots find the first of each mechanic where it appears', () => {
  const spots = encounterSpots({
    pads: [[900, 'spring'], [400, 'boost'], [1200, 'boost']],
    movingPlatforms: [{ x: 1500, y: 490 }],
    ropes: [{ x: 2000, y: 130, length: 230 }],
    walls: [{ x: 2500, y: 440 }],
    enemyDetails: [{ kind: 'patrol', x: 100, y: 462 }, { kind: 'hopper', x: 3000, y: 462 }, { kind: 'hopper', x: 3200, y: 462 }],
  });
  assert.deepEqual(spots, [
    { key: 'boost', x: 400, y: 472 },
    { key: 'spring', x: 900, y: 472 },
    { key: 'platform', x: 1500, y: 490 },
    { key: 'rope', x: 2000, y: 245 },
    { key: 'wall', x: 2500, y: 440 },
    { key: 'hopper', x: 3000, y: 462 },
  ]);
});

test('ropes, moving platforms and hoppers still get a hint in the stages that use them', () => {
  for (const key of ['rope', 'platform', 'hopper'] as const) {
    const index = STAGES.findIndex((stage) => encounterSpots(stage).some((spot) => spot.key === key));
    assert.ok(index > 0 && !STAGES[index].tutorial, `${key} first appears in stage ${index + 1}`);
  }
});
