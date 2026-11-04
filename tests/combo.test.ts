import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMBO, PHYSICS } from '../src/game/config.ts';
import { breakCombo, createComboState, registerRollKill } from '../src/game/combo.ts';

test('roll kills inside the window chain; the first only keeps the roll going', () => {
  const combo = createComboState();
  const first = registerRollKill(COMBO, combo, 1000);
  assert.deepEqual(first, { count: 1, rollMs: COMBO.rollExtendMs, boostMs: 0, speed: 0, bonusCoins: 0 });
  const second = registerRollKill(COMBO, combo, 1000 + COMBO.windowMs);
  assert.equal(second.count, 2);
  assert.equal(second.bonusCoins, 1);
  assert.ok(second.boostMs > 0 && second.speed >= PHYSICS.boostLaunch, 'a chain speeds the roll up');
  assert.equal(registerRollKill(COMBO, combo, 1000 + COMBO.windowMs * 2 + 1).count, 1, 'too late: starts over');
});

test('longer chains pay more and roll faster, up to the caps', () => {
  const combo = createComboState();
  const rewards = Array.from({ length: 8 }, (_, i) => registerRollKill(COMBO, combo, i * 300));
  assert.deepEqual(rewards.map((reward) => reward.count), [1, 2, 3, 4, 5, 6, 7, 8]);
  for (let i = 2; i < rewards.length; i++) {
    assert.ok(rewards[i].bonusCoins >= rewards[i - 1].bonusCoins && rewards[i].speed >= rewards[i - 1].speed);
  }
  assert.equal(rewards.at(-1)!.bonusCoins, COMBO.maxBonusCoins);
  assert.equal(rewards.at(-1)!.speed, COMBO.maxSpeed);
  // The scene's speed cap is 480 px/s; a combo never asks for more.
  assert.ok(COMBO.maxSpeed <= 480);
});

test('a hit ends the chain', () => {
  const combo = createComboState();
  registerRollKill(COMBO, combo, 0);
  registerRollKill(COMBO, combo, 200);
  breakCombo(combo);
  assert.equal(registerRollKill(COMBO, combo, 400).count, 1);
});
