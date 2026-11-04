import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHYSICS } from '../src/game/config.ts';
import { rates, scenarios, simulate } from './dash-scenarios.ts';

// 220 / 260 / 300 ms were compared on these scenarios (round 2): 220 missed quick double taps 250 ms
// apart, 300 dashed on a deliberate 450 ms nudge, 260 met both targets at 60, 30 and 20 fps.

test('the scenario set keeps intended dashes and accidents apart', () => {
  const list = scenarios();
  assert.ok(list.filter((scenario) => scenario.intended).length >= 30);
  assert.ok(list.filter((scenario) => !scenario.intended).length >= 20);
  for (const scenario of list) assert.equal(scenario.intended || !scenario.expectDash, true, `${scenario.name}: an accident never expects a dash`);
});

for (const fps of [60, 30, 20]) {
  test(`spin dash input at ${fps} fps: at least 95% of intended dashes, at most 5% accidental`, () => {
    const result = rates(PHYSICS, fps);
    assert.ok(result.intendedSuccess >= 0.95, `intended ${(result.intendedSuccess * 100).toFixed(0)}%: ${result.misses.join(' / ')}`);
    assert.ok(result.accidentalRate <= 0.05, `accidental ${(result.accidentalRate * 100).toFixed(0)}%: ${result.misses.join(' / ')}`);
    assert.deepEqual(result.misses, []);
  });
}

test('double taps are timed by the touch events, so the frame rate never changes the outcome', () => {
  for (const scenario of scenarios()) {
    const outcomes = [60, 30, 20].map((fps) => simulate(PHYSICS, scenario, fps).dashed);
    assert.ok(outcomes.every((dashed) => dashed === outcomes[0]), `${scenario.group} · ${scenario.name}: ${outcomes.join(' / ')}`);
  }
});
