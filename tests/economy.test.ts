import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECONOMY } from '../src/game/config.ts';
import { bossBonus, buyItem, clearReward, reviveOffer, takeItems } from '../src/game/economy.ts';

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

test('boss bonus grows with the boss level', () => {
  assert.equal(bossBonus(1, ECONOMY), ECONOMY.bossBonus);
  assert.equal(bossBonus(10, ECONOMY), ECONOMY.bossBonus + 9 * ECONOMY.bossBonusPerLevel);
});

test('buying needs enough coins and adds one item', () => {
  const wallet = { currency: 50, items: ['magnet'] };
  assert.equal(buyItem(wallet, 'shield', 30), true);
  assert.deepEqual(wallet, { currency: 20, items: ['magnet', 'shield'] });
  assert.equal(buyItem(wallet, 'shield', 30), false);
  assert.deepEqual(wallet, { currency: 20, items: ['magnet', 'shield'] });
});

test('starting a stage uses one of each chosen item that is owned', () => {
  const items = ['shield', 'shield', 'magnet'];
  assert.deepEqual(takeItems(items, ['shield', 'shield', 'extra-heart', 'magnet']), ['shield', 'magnet']);
  assert.deepEqual(items, ['shield']);
});
