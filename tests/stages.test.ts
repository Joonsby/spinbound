import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHYSICS } from '../src/game/config.ts';
import { GROUND_TOP, STAGES, type StageData } from '../src/stages.ts';
import { routeOf, routeProgress } from '../src/stage-gen.ts';

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
type Surface = { left: number; right: number; top: number; solid: boolean };

// Standing surfaces: platform tops split wherever a block rises through the walking band, plus
// one-way ledges and the swept area of sideways moving platforms.
function surfaces(stage: StageData) {
  const solids = stage.platforms.map(([x, y, width, height]) => ({ left: x - width / 2, right: x + width / 2, top: y - height / 2, bottom: y + height / 2 }));
  const tops = [...solids].sort((a, b) => a.top - b.top || a.left - b.left);
  const merged: { left: number; right: number; top: number }[] = [];
  for (const rect of tops) {
    const last = merged.find((other) => other.top === rect.top && rect.left <= other.right + 1 && rect.right >= other.left - 1);
    if (last) { last.left = Math.min(last.left, rect.left); last.right = Math.max(last.right, rect.right); } else merged.push({ ...rect });
  }
  const list: Surface[] = [];
  for (const surface of merged) {
    const blockers = solids.filter((rect) => rect.top < surface.top - 2 && rect.bottom > surface.top - 40 && rect.right > surface.left && rect.left < surface.right)
      .sort((a, b) => a.left - b.left);
    let from = surface.left;
    for (const block of blockers) {
      if (block.left > from) list.push({ left: from, right: block.left, top: surface.top, solid: true });
      from = Math.max(from, block.right);
    }
    if (surface.right > from) list.push({ left: from, right: surface.right, top: surface.top, solid: true });
  }
  for (const [x, y, width, height] of stage.oneWayPlatforms ?? []) list.push({ left: x - width / 2, right: x + width / 2, top: y - height / 2, solid: false });
  for (const platform of stage.movingPlatforms) {
    if (platform.axis === 'x') list.push({ left: platform.min - 55, right: platform.max + 55, top: platform.y - 10, solid: false });
  }
  return list;
}

const gapBetween = (a: Surface, b: Surface) => Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));

// Horizontal reach of a running jump that lands `rise` px higher (negative: lower), with a margin.
function jumpReach(rise: number) {
  const descent = PHYSICS.jumpSpeed ** 2 - 2 * PHYSICS.gravity * rise;
  if (descent < 0) return -Infinity;
  return PHYSICS.runSpeed * (PHYSICS.jumpSpeed + Math.sqrt(descent)) / PHYSICS.gravity - 40;
}

// Conservative moves: a jump, a walk off an edge, a spring, an elevator or a rope swing.
function canMove(stage: StageData, a: Surface, b: Surface) {
  const gap = gapBetween(a, b);
  const rise = a.top - b.top;
  const overlapping = gap === 0;
  if (overlapping && Math.abs(rise) <= 2) return true;
  if (rise > 0) {
    const jump = rise <= JUMP_HEIGHT - 25 && gap <= jumpReach(rise) && (!overlapping || !b.solid || a.left < b.left - 20 || a.right > b.right + 20);
    const spring = stage.pads.some(([x, kind, padY = 472]) => kind === 'spring' && padY + 8 === a.top && x >= a.left && x <= a.right
      && rise <= 290 && Math.max(0, b.left - x, x - b.right) <= 220);
    const lift = stage.movingPlatforms.some((platform) => platform.axis === 'y'
      && Math.abs(a.top - (platform.max - 10)) <= JUMP_HEIGHT - 25 && a.top >= platform.max - 10 && Math.abs(b.top - (platform.min - 10)) <= 2
      && platform.x + 55 >= a.left - 30 && platform.x - 55 <= a.right + 30 && platform.x + 55 >= b.left - 30 && platform.x - 55 <= b.right + 30);
    return jump || spring || lift;
  }
  const drop = -rise;
  if (overlapping) return drop > 0 && (b.left < a.left - 30 || b.right > a.right + 30);
  const rope = (stage.ropes ?? []).some((r) => drop <= 10 && r.x > Math.min(a.right, b.right) && r.x < Math.max(a.left, b.left) && gap <= 470);
  return gap <= jumpReach(rise) || rope;
}

function surfaceUnder(list: Surface[], x: number, y: number) {
  return list.filter((surface) => x >= surface.left && x <= surface.right && surface.top >= y - 2).sort((a, b) => a.top - b.top)[0];
}

function reachable(stage: StageData) {
  const list = surfaces(stage);
  const start = stage.start ?? { x: 90, y: 440 };
  const goal = stage.goal ?? { x: stage.width - 130, y: stage.goalY ?? 420 };
  const from = surfaceUnder(list, start.x, start.y);
  const to = surfaceUnder(list, goal.x, goal.y + 58);
  assert.ok(from, 'start floats');
  assert.ok(to && to.top === goal.y + 60, 'goal floats');
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const current = queue.shift()!;
    if (current === to) return true;
    for (const next of list) {
      if (!seen.has(next) && canMove(stage, current, next)) { seen.add(next); queue.push(next); }
    }
  }
  return false;
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
      assert.ok(surfaceTops(stage, point.x).includes(point.y + 30), `checkpoint ${point.x} over a pit`);
      // Only enemies over the checkpoint's own floor can camp it.
      for (const enemy of [...(stage.enemyDetails ?? []).filter((enemy) => floorBelow(stage, enemy.x, enemy.y) === point.y + 30), ...stage.enemies.map(([min, max]) => ({ min, max }))]) {
        assert.ok(point.x < enemy.min - 40 || point.x > enemy.max + 40, `checkpoint ${point.x} inside a patrol`);
      }
    }
    for (const rope of stage.ropes ?? []) {
      assert.ok(rope.y >= 60 && rope.y + rope.length <= GROUND_TOP - 80, `rope at ${rope.x} reaches too low/high`);
    }
    const sections = stage.sections ?? [];
    for (let i = 1; i < sections.length; i++) assert.ok(sections[i].x > sections[i - 1].x, 'sections in order');
  });

  test(`${label}: the goal can be reached from the start`, () => {
    assert.ok(reachable(stage), 'no route from start to goal');
  });

  test(`${label}: terrain stays inside the stage and within texture limits`, () => {
    for (const [x, , width] of stage.platforms) {
      assert.ok(x - width / 2 >= -1 && x + width / 2 <= stage.width + 1, `platform at ${x} leaves the stage`);
      // World 1 has one hand-checked 2100px arena floor.
      assert.ok(width <= (index < 10 ? 2100 : 1000), `platform at ${x} is ${width}px wide`);
    }
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

test('100 stages in 10 worlds, each generated world ending in a finale', () => {
  assert.equal(STAGES.length, 100);
  for (let world = 2; world <= 10; world++) assert.ok(STAGES[world * 10 - 1].name.endsWith('피날레'), `world ${world} finale`);
  const layouts = new Set(STAGES.slice(10).map((stage) => stage.name.split(' · ')[1]));
  for (const label of ['질주', '되돌아가기', '오르막', '내리막', '구름다리', '피날레']) assert.ok(layouts.has(label), label);
  // Some stages finish left of the start and some above it.
  assert.ok(STAGES.some((stage) => stage.goal && stage.start && stage.goal.x < stage.start.x));
  assert.ok(STAGES.some((stage) => stage.goal && stage.start && stage.goal.y < stage.start.y - 200));
  assert.ok(STAGES.some((stage) => stage.goal && stage.start && stage.goal.y > stage.start.y + 200));
});

test('every stage is about as long as stage 1', () => {
  for (const [index, stage] of STAGES.entries()) {
    // Path length: the width once per storey that has a long floor.
    const storeys = new Set(stage.platforms.filter(([, , width]) => width >= 500).map(([, y, , height]) => y - height / 2)).size;
    assert.ok(stage.width * storeys >= 10000, `stage ${index + 1}: ${stage.width}px × ${storeys}`);
  }
});

test('checkpoints come in the order a run reaches them, about every 3000px on a single floor', () => {
  for (const [index, stage] of STAGES.entries()) {
    const points = stage.checkpoints ?? [stage.checkpoint];
    const sameFloor = points.every((point) => point.y === points[0].y);
    if (!sameFloor) continue;
    const xs = points.map((point) => point.x);
    const rightward = !stage.goal || !stage.start || stage.goal.x > stage.start.x;
    const ordered = rightward ? xs.every((x, i) => i === 0 || x > xs[i - 1]) : xs.every((x, i) => i === 0 || x < xs[i - 1]);
    assert.ok(ordered, `stage ${index + 1} checkpoints out of order`);
    const path = [rightward ? 0 : stage.width, ...xs, rightward ? stage.width : 0];
    for (let i = 1; i < path.length; i++) assert.ok(Math.abs(path[i] - path[i - 1]) <= 4800, `stage ${index + 1}: gap near ${path[i - 1]}`);
  }
});

test('stage 1 is a short session: at most ~12k px with checkpoints every ≤ 3k px', () => {
  const stage = STAGES[0];
  assert.ok(stage.width <= 12000);
  const xs = [0, ...(stage.checkpoints ?? []).map((point) => point.x), stage.width];
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] <= 4800, `gap ${xs[i - 1]}–${xs[i]}`);
});

test('progress runs from 0 at the start to 1 at the goal and never drops along the route', () => {
  for (const [index, stage] of STAGES.entries()) {
    const route = routeOf(stage);
    let last = -1;
    for (let i = 1; i < route.length; i++) {
      const [a, b] = [route[i - 1], route[i]];
      if (a.y !== b.y) continue;
      for (let step = 0; step <= 20; step++) {
        const share = routeProgress(route, a.x + (b.x - a.x) * step / 20, a.y);
        assert.ok(share >= last - 1e-9, `stage ${index + 1}: progress fell to ${share} on leg ${i}`);
        last = share;
      }
    }
    assert.equal(routeProgress(route, route[0].x, route[0].y), 0, `stage ${index + 1} start`);
    assert.ok(routeProgress(route, route.at(-1)!.x, route.at(-1)!.y) > 0.999, `stage ${index + 1} goal`);
  }
});

test('standing on a ledge or stair never counts as the floor above', () => {
  for (const [index, stage] of STAGES.entries()) {
    const route = routeOf(stage);
    for (let i = 1; i < route.length; i++) {
      const [a, b] = [route[i - 1], route[i]];
      if (a.y !== b.y) continue;
      const x = (a.x + b.x) / 2;
      assert.equal(routeProgress(route, x, a.y - 160), routeProgress(route, x, a.y), `stage ${index + 1} leg ${i}`);
    }
  }
});

test('checkpoints sit on the route in the order they are reached', () => {
  for (const [index, stage] of STAGES.entries()) {
    const route = routeOf(stage);
    const shares = (stage.checkpoints ?? [stage.checkpoint]).map((point) => routeProgress(route, point.x, point.y + 30));
    assert.ok(shares.every((share, i) => i === 0 || share > shares[i - 1]), `stage ${index + 1}: ${shares.map((share) => share.toFixed(2))}`);
  }
});
