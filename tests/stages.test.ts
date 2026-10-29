import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHYSICS } from '../src/game/config.ts';
import { GROUND_TOP, STAGES, type StageData } from '../src/stages.ts';

// Horizontal distance of a full jump at plain run speed, minus a safety margin.
const JUMP_REACH = PHYSICS.runSpeed * (2 * PHYSICS.jumpSpeed / PHYSICS.gravity) - 20;
const JUMP_HEIGHT = PHYSICS.jumpSpeed ** 2 / (2 * PHYSICS.gravity);

function floorRuns(stage: StageData) {
  const runs = stage.platforms
    .filter(([, y, , height]) => y + height / 2 >= 600)
    .map(([x, , width]) => [x - width / 2, x + width / 2] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const run of runs) {
    const last = merged.at(-1);
    if (last && run[0] <= last[1] + 1) last[1] = Math.max(last[1], run[1]);
    else merged.push([...run]);
  }
  return merged;
}

function surfaceTops(stage: StageData, x: number) {
  return [...stage.platforms, ...(stage.oneWayPlatforms ?? [])]
    .filter(([px, , width]) => x >= px - width / 2 && x <= px + width / 2)
    .map(([, y, , height]) => y - height / 2);
}
// Nearest surface under the point (x, y).
function floorBelow(stage: StageData, x: number, y: number) {
  const tops = surfaceTops(stage, x).filter((top) => top > y);
  return tops.length ? Math.min(...tops) : undefined;
}

for (const [index, stage] of STAGES.entries()) {
  const label = `stage ${index + 1} (${stage.name})`;

  test(`${label}: every pit is jumpable or bridged by a rope or moving platform`, () => {
    const runs = floorRuns(stage);
    for (let i = 1; i < runs.length; i++) {
      const [from, to] = [runs[i - 1][1], runs[i][0]];
      if (to - from <= JUMP_REACH) continue;
      const bridged = (stage.ropes ?? []).some((rope) => rope.x > from && rope.x < to)
        || stage.movingPlatforms.some((platform) => platform.axis === 'x' && platform.min - 55 <= from + 60 && platform.max + 55 >= to - 60);
      assert.ok(bridged, `${to - from}px pit at ${from}–${to}`);
    }
  });

  test(`${label}: flying enemies hover where a jump can stomp them`, () => {
    for (const enemy of stage.enemyDetails ?? []) {
      if (enemy.kind !== 'fly') continue;
      const top = floorBelow(stage, enemy.x, enemy.y);
      assert.ok(top !== undefined, `fly at ${enemy.x} has no floor`);
      const clearance = top - enemy.y;
      // Lowest bob must stay reachable from above, highest bob must stay below a full jump.
      assert.ok(clearance >= 60 && clearance + 24 + 18 <= JUMP_HEIGHT + 10, `fly at ${enemy.x}: ${clearance}px above floor`);
    }
  });

  test(`${label}: pads, checkpoints and ropes sit on sensible ground`, () => {
    for (const [x, kind, padY = 472] of stage.pads) {
      assert.ok(surfaceTops(stage, x).includes(padY + 8), `${kind} at ${x} floats or is buried`);
    }
    for (const point of stage.checkpoints ?? [stage.checkpoint]) {
      assert.ok(floorRuns(stage).some(([from, to]) => point.x > from && point.x < to), `checkpoint ${point.x} over a pit`);
      for (const enemy of [...(stage.enemyDetails ?? []), ...stage.enemies.map(([min, max]) => ({ min, max }))]) {
        assert.ok(point.x < enemy.min - 40 || point.x > enemy.max + 40, `checkpoint ${point.x} inside a patrol`);
      }
    }
    for (const rope of stage.ropes ?? []) {
      assert.ok(rope.y >= 60 && rope.y + rope.length <= GROUND_TOP - 80, `rope at ${rope.x} reaches too low/high`);
    }
    const sections = stage.sections ?? [];
    for (let i = 1; i < sections.length; i++) assert.ok(sections[i].x > sections[i - 1].x, 'sections in order');
  });

  test(`${label}: breakable walls are optional (a jumpable route passes over them)`, () => {
    for (const wall of stage.walls ?? []) {
      const height = wall.height ?? 80;
      const wallTop = wall.y - height / 2;
      const top = floorBelow(stage, wall.x, 0) ?? wallTop;
      const climb = GROUND_TOP - Math.min(top, wallTop);
      assert.ok(climb <= JUMP_HEIGHT - 20, `wall at ${wall.x} blocks a ${climb}px climb`);
    }
  });
}

test('boss arena has boosters on both halves so a roll is always reachable', () => {
  for (const stage of STAGES) {
    if (!stage.boss) continue;
    const { left, right } = stage.boss;
    const middle = (left + right) / 2;
    const boosts = stage.pads.filter(([x, kind]) => kind === 'boost' && x > left && x < right);
    assert.ok(boosts.some(([x]) => x < middle) && boosts.some(([x]) => x > middle));
  }
});

test('stage 1 is a short session: at most ~12k px with checkpoints every ≤ 3k px', () => {
  const stage = STAGES[0];
  assert.ok(stage.width <= 12000);
  const xs = [0, ...(stage.checkpoints ?? []).map((point) => point.x), stage.width];
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] <= 4800, `gap ${xs[i - 1]}–${xs[i]}`);
});
