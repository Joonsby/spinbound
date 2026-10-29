import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERS, earnedCharacters } from '../src/characters.ts';
import { STAGES } from '../src/stages.ts';

test('40 robots with unique ids and every rarity', () => {
  assert.equal(CHARACTERS.length, 40);
  assert.equal(new Set(CHARACTERS.map((character) => character.id)).size, 40);
  for (const rarity of ['common', 'rare', 'epic', 'legendary']) assert.ok(CHARACTERS.some((character) => character.rarity === rarity), rarity);
});

test('commons come from clears, epics from bosses, rares and legendaries from coins', () => {
  for (const { id, rarity, unlock } of CHARACTERS) {
    if (unlock.kind === 'start') continue;
    const expected = { common: 'clear', rare: 'coins', epic: 'boss', legendary: 'coins' }[rarity];
    assert.equal(unlock.kind, expected, id);
    if (unlock.kind === 'clear') assert.ok(unlock.stage >= 1 && unlock.stage <= STAGES.length, id);
    if (unlock.kind === 'boss') assert.ok(STAGES[unlock.stage - 1]?.boss, `${id}: stage ${unlock.stage} has no boss`);
  }
});

test('every boss stage rewards its own robot', () => {
  const rewarded = CHARACTERS.flatMap(({ unlock }) => unlock.kind === 'boss' ? [unlock.stage] : []);
  STAGES.forEach((stage, index) => { if (stage.boss) assert.ok(rewarded.includes(index + 1), `boss stage ${index + 1}`); });
});

test('clearing a stage earns the robots for it and every earlier stage, never coin robots', () => {
  assert.deepEqual(earnedCharacters(1), []);
  assert.deepEqual(earnedCharacters(2).map((character) => character.id), ['mint-02']);
  const afterBoss = earnedCharacters(4).map((character) => character.id);
  assert.ok(afterBoss.includes('forge-knight') && afterBoss.includes('lemon-03'));
  assert.ok(earnedCharacters(101).every((character) => character.unlock.kind !== 'coins'));
});
