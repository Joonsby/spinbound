import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECONOMY } from '../src/game/config.ts';
import { clearReward, reviveOffer } from '../src/game/economy.ts';

test('a clear pays the coins picked up plus the bonus', () => {
  assert.equal(clearReward(37, ECONOMY), 37 + ECONOMY.clearBonus);
  assert.equal(clearReward(0, ECONOMY), ECONOMY.clearBonus);
  assert.equal(clearReward(-5, ECONOMY), ECONOMY.clearBonus, 'never negative');
});

test('no revive before a checkpoint; paying needs enough coins', () => {
  assert.equal(reviveOffer(false, 999, ECONOMY).offered, false);
  assert.equal(reviveOffer(false, 999, ECONOMY).canPay, false);
  assert.deepEqual(reviveOffer(true, ECONOMY.reviveCost - 1, ECONOMY), { offered: true, canPay: false, cost: ECONOMY.reviveCost });
  assert.equal(reviveOffer(true, ECONOMY.reviveCost, ECONOMY).canPay, true);
});
