import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERS, earnedCharacters, unlockStage } from '../src/characters.ts';
import { STAGES } from '../src/stages.ts';

test('43 robots with unique ids and every rarity', () => {
  assert.equal(CHARACTERS.length, 43);
  assert.equal(new Set(CHARACTERS.map((character) => character.id)).size, 43);
  for (const rarity of ['common', 'rare', 'epic', 'legendary']) assert.ok(CHARACTERS.some((character) => character.rarity === rarity), rarity);
});

test('commons come from clears, epics from worlds, rares and legendaries from coins', () => {
  for (const { id, rarity, unlock } of CHARACTERS) {
    if (unlock.kind === 'start' || unlock.kind === 'attendance') continue;
    const expected = { common: 'clear', rare: 'coins', epic: 'world', legendary: 'coins' }[rarity];
    assert.equal(unlock.kind, expected, id);
    if (unlock.kind === 'clear') assert.ok(unlock.stage >= 1 && unlock.stage <= STAGES.length, id);
    if (unlock.kind === 'world') assert.ok((unlockStage(unlock) ?? 0) <= STAGES.length, id);
  }
});

test('every world rewards its own epic robot', () => {
  const rewarded = CHARACTERS.flatMap(({ unlock }) => unlock.kind === 'world' ? [unlock.world] : []);
  for (let world = 1; world <= STAGES.length / 10; world++) assert.ok(rewarded.includes(world), `world ${world}`);
});

test('clearing a stage earns the robots for it and every earlier stage, never coin robots', () => {
  assert.deepEqual(earnedCharacters(1), []);
  assert.deepEqual(earnedCharacters(2).map((character) => character.id), ['mint-02']);
  assert.ok(!earnedCharacters(10).some((character) => character.id === 'forge-knight'));
  const afterWorld = earnedCharacters(11).map((character) => character.id);
  assert.ok(afterWorld.includes('forge-knight') && afterWorld.includes('lime-06'));
  assert.ok(earnedCharacters(101).every((character) => character.unlock.kind !== 'coins'));
});

test('every robot has its own shape, not just its own colours', () => {
  const shapes = CHARACTERS.map(({ look }) => JSON.stringify(Object.entries(look).sort()));
  assert.equal(new Set(shapes).size, CHARACTERS.length);
});

test('attendance hands out a robot at 7, 14 and 28 days', () => {
  const days = CHARACTERS.flatMap(({ unlock }) => unlock.kind === 'attendance' ? [unlock.days] : []);
  assert.deepEqual(days.sort((a, b) => a - b), [7, 14, 28]);
});
