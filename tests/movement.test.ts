import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHYSICS } from '../src/game/config.ts';
import { applyBoost, createJumpState, createRunState, cutJump, nextRolling, noteGrounded, pressJump, stepRun, tryJump } from '../src/game/movement.ts';

const FRAME = 1000 / 60;

// Runs the ground loop like Player.update does and records when the roll toggles.
function simulate(frames: number, input: (frame: number) => -1 | 0 | 1, options: { boostedUntil?: number; startVx?: number; grounded?: boolean } = {}) {
  const run = createRunState();
  run.vx = options.startVx ?? 0;
  let rolling = false;
  let x = 0;
  const toggles: { frame: number; rolling: boolean; vx: number; x: number }[] = [];
  const speeds: number[] = [];
  for (let frame = 0; frame < frames; frame++) {
    const boosted = frame * FRAME < (options.boostedUntil ?? -1);
    stepRun(PHYSICS, run, input(frame), options.grounded ?? true, boosted, FRAME);
    x += run.vx * FRAME / 1000;
    const next = nextRolling(PHYSICS, { rolling, grounded: options.grounded ?? true, speed: Math.abs(run.vx), blocked: false });
    if (next !== rolling) toggles.push({ frame, rolling: next, vx: run.vx, x });
    rolling = next;
    speeds.push(run.vx);
  }
  return { run, rolling, toggles, speeds, x };
}

test('plain running reaches run speed quickly but does not roll at once', () => {
  const result = simulate(18, () => 1);
  assert.ok(result.run.vx >= PHYSICS.runSpeed - 1, `vx ${result.run.vx}`);
  assert.equal(result.rolling, false);
});

test('holding one direction builds momentum into an automatic roll', () => {
  const result = simulate(180, () => 1);
  assert.equal(result.toggles.length, 1);
  const enter = result.toggles[0];
  assert.equal(enter.rolling, true);
  const seconds = enter.frame * FRAME / 1000;
  assert.ok(seconds > 1.4 && seconds < 2.4, `rolled after ${seconds.toFixed(2)}s`);
  assert.ok(enter.x > 380 && enter.x < 700, `rolled after ${enter.x.toFixed(0)}px`);
  assert.ok(result.run.vx <= PHYSICS.sprintSpeed + 1e-9);
});

test('releasing input decelerates smoothly and leaves the roll exactly once', () => {
  const result = simulate(300, (frame) => (frame < 150 ? 1 : 0));
  assert.deepEqual(result.toggles.map((toggle) => toggle.rolling), [true, false]);
  assert.ok(result.toggles[1].vx < PHYSICS.rollExitSpeed && result.toggles[1].vx > PHYSICS.rollExitSpeed - 20);
  for (let i = 151; i < result.speeds.length; i++) {
    assert.ok(result.speeds[i - 1] - result.speeds[i] <= PHYSICS.groundDecel * FRAME / 1000 + 1e-9, 'no instant stop');
  }
  assert.equal(result.run.vx, 0);
});

test('speeds between the exit and enter thresholds never toggle the roll', () => {
  for (const startRolling of [true, false]) {
    let rolling = startRolling;
    for (let frame = 0; frame < 120; frame++) {
      const speed = 290 + Math.sin(frame / 3) * 25;
      rolling = nextRolling(PHYSICS, { rolling, grounded: true, speed, blocked: false });
      assert.equal(rolling, startRolling);
    }
  }
});

test('a booster launches into a roll that survives the boost while the direction is held', () => {
  const run = createRunState();
  run.vx = 150;
  applyBoost(PHYSICS, run, 1);
  assert.equal(run.vx, PHYSICS.boostLaunch);
  let rolling = nextRolling(PHYSICS, { rolling: false, grounded: true, speed: run.vx, blocked: false });
  assert.equal(rolling, true);
  for (let frame = 0; frame < 240; frame++) {
    stepRun(PHYSICS, run, 1, true, frame * FRAME < PHYSICS.boostMs, FRAME);
    rolling = nextRolling(PHYSICS, { rolling, grounded: true, speed: Math.abs(run.vx), blocked: false });
    assert.equal(rolling, true, `frame ${frame} vx ${run.vx}`);
  }
  assert.ok(Math.abs(run.vx - PHYSICS.sprintSpeed) < 1);
});

test('turning around skids through zero instead of flipping velocity', () => {
  const result = simulate(120, (frame) => (frame < 40 ? 1 : -1));
  const limit = (PHYSICS.groundDecel + PHYSICS.groundAccel) * FRAME / 1000 + 1e-9;
  for (let i = 41; i < result.speeds.length; i++) assert.ok(Math.abs(result.speeds[i] - result.speeds[i - 1]) <= limit);
  const crossing = result.speeds.findIndex((vx, i) => i > 40 && vx <= 0);
  assert.equal(result.speeds[crossing], 0, 'passes through a standstill');
  assert.ok(result.speeds.at(-1)! < -PHYSICS.runSpeed + 1);
});

test('air speed alone never turns a plain jump into a spin attack', () => {
  assert.equal(nextRolling(PHYSICS, { rolling: false, grounded: false, speed: PHYSICS.boostSpeed, blocked: false }), false);
  assert.equal(nextRolling(PHYSICS, { rolling: true, grounded: false, speed: PHYSICS.rollExitSpeed + 1, blocked: false }), true);
  assert.equal(nextRolling(PHYSICS, { rolling: true, grounded: false, speed: PHYSICS.rollExitSpeed - 1, blocked: false }), false);
  assert.equal(nextRolling(PHYSICS, { rolling: true, grounded: true, speed: PHYSICS.boostSpeed, blocked: true }), false);
});

test('jump buffer accepts an early press only within the window', () => {
  const jump = createJumpState();
  pressJump(jump, 1000);
  noteGrounded(jump, 1000 + PHYSICS.jumpBufferMs - 20);
  assert.equal(tryJump(PHYSICS, jump, 1000 + PHYSICS.jumpBufferMs - 20), -PHYSICS.jumpSpeed);

  const late = createJumpState();
  pressJump(late, 1000);
  noteGrounded(late, 1000 + PHYSICS.jumpBufferMs + 30);
  assert.equal(tryJump(PHYSICS, late, 1000 + PHYSICS.jumpBufferMs + 30), undefined);
});

test('coyote time allows one late jump and no double jump', () => {
  const jump = createJumpState();
  noteGrounded(jump, 2000);
  pressJump(jump, 2000 + PHYSICS.coyoteMs - 10);
  assert.equal(tryJump(PHYSICS, jump, 2000 + PHYSICS.coyoteMs - 10), -PHYSICS.jumpSpeed);
  pressJump(jump, 2000 + PHYSICS.coyoteMs);
  assert.equal(tryJump(PHYSICS, jump, 2000 + PHYSICS.coyoteMs), undefined, 'no air jump');

  const late = createJumpState();
  noteGrounded(late, 2000);
  pressJump(late, 2000 + PHYSICS.coyoteMs + 30);
  assert.equal(tryJump(PHYSICS, late, 2000 + PHYSICS.coyoteMs + 30), undefined);
});

function apex(holdFrames: number, cuttable = true) {
  const jump = createJumpState();
  let vy = -PHYSICS.jumpSpeed;
  jump.cuttable = cuttable;
  let y = 0;
  let top = 0;
  for (let frame = 0; frame < 120; frame++) {
    vy = cutJump(PHYSICS, jump, vy, frame < holdFrames);
    y += vy * FRAME / 1000;
    vy += PHYSICS.gravity * FRAME / 1000;
    top = Math.min(top, y);
  }
  return -top;
}

test('variable jump: a tap is clearly lower than a held jump, springs are never cut', () => {
  const tap = apex(5);
  const full = apex(120);
  assert.ok(full > 130 && full < 165, `full ${full.toFixed(1)}`);
  assert.ok(tap < full * 0.7, `tap ${tap.toFixed(1)} vs full ${full.toFixed(1)}`);
  assert.equal(apex(1, false), full);
});
