import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeProgress, sameProgress, toSynced } from '../src/progress-merge.ts';
import type { PlayerProgress } from '../src/progress.ts';

const base = (): PlayerProgress => ({
  version: 1, level: 1, currency: 0, stats: { attack: 10, defense: 0, maxHp: 3, maxEnergy: 100 },
  ownedCharacters: ['orange-01'], equippedCharacter: 'orange-01', unlockedStage: 1, items: [],
  soundEnabled: true, graphicsQuality: 'auto', attendance: { last: '', days: 0 },
});

test('progress made on two devices is kept from both', () => {
  const phone = { ...base(), unlockedStage: 4, items: ['repair-kit', 'repair-kit'] };
  const tablet = { ...base(), level: 3, currency: 50, items: ['repair-kit', 'energy-cell'] };
  const merged = mergeProgress(phone, toSynced(tablet));
  assert.equal(merged.unlockedStage, 4);
  assert.equal(merged.level, 3);
  assert.equal(merged.currency, 50);
  assert.deepEqual(merged.items, ['repair-kit', 'repair-kit', 'energy-cell']);
});

test('device settings are not synced and stay local', () => {
  const local = { ...base(), soundEnabled: false, graphicsQuality: 'low' as const };
  const remote = { ...base(), soundEnabled: true, graphicsQuality: 'high' as const };
  assert.equal('soundEnabled' in toSynced(remote), false);
  const merged = mergeProgress(local, toSynced(remote));
  assert.deepEqual([merged.soundEnabled, merged.graphicsQuality], [false, 'low']);
  assert.equal(sameProgress(local, remote), true);
});

test('attendance keeps the copy with more days claimed', () => {
  const phone = { ...base(), attendance: { last: '2026-10-30', days: 9 } };
  const tablet = { ...base(), attendance: { last: '2026-10-28', days: 7 } };
  assert.deepEqual(mergeProgress(tablet, toSynced(phone)).attendance, phone.attendance);
  assert.deepEqual(mergeProgress(phone, toSynced(tablet)).attendance, phone.attendance);
});
