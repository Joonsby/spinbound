import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECONOMY, UPGRADES } from '../src/game/config.ts';
import { buyItem, buyUpgrade, clearReward, reviveOffer, takeItems, upgradeCost, upgradeLevel, worldBonus } from '../src/game/economy.ts';

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

test('world clear bonus grows with the world', () => {
  assert.equal(worldBonus(1, ECONOMY), ECONOMY.worldBonus);
  assert.equal(worldBonus(10, ECONOMY), ECONOMY.worldBonus + 9 * ECONOMY.worldBonusPerWorld);
});

test('upgrades climb one level per purchase and stop at the top', () => {
  const rule = UPGRADES.maxHp;
  const wallet = { currency: 10000, stats: { attack: 10, defense: 0, maxHp: rule.base } };
  assert.equal(upgradeLevel(wallet.stats.maxHp, rule), 0);
  for (const cost of rule.costs) {
    const before = wallet.currency;
    assert.equal(buyUpgrade(wallet, 'maxHp', rule), true);
    assert.equal(before - wallet.currency, cost);
  }
  assert.equal(wallet.stats.maxHp, rule.base + rule.step * rule.costs.length);
  assert.equal(upgradeCost(wallet.stats.maxHp, rule), null);
  assert.equal(buyUpgrade(wallet, 'maxHp', rule), false);
});

test('an upgrade needs enough coins and changes nothing otherwise', () => {
  const wallet = { currency: UPGRADES.attack.costs[0] - 1, stats: { attack: 10, defense: 0, maxHp: 3 } };
  assert.equal(buyUpgrade(wallet, 'attack', UPGRADES.attack), false);
  assert.deepEqual(wallet, { currency: UPGRADES.attack.costs[0] - 1, stats: { attack: 10, defense: 0, maxHp: 3 } });
});

test('defense never reaches a hit that costs nothing', () => {
  const { base, step, costs } = UPGRADES.defense;
  assert.ok(base + step * costs.length <= 50);
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
