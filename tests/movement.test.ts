import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHYSICS } from '../src/game/config.ts';
import { applyBoost, createDashState, createJumpState, createRunState, createTapState, cutJump, dashDirection, nextRolling, noteGrounded, pressJump, registerTap, stepRun, tryDash, tryJump } from '../src/game/movement.ts';

const FRAME = 1000 / 60;

// Runs the ground loop like Player.update does; `rollMs` > 0 starts a roll on the first frame like a booster.
function simulate(frames: number, input: (frame: number) => -1 | 0 | 1, options: { boostedUntil?: number; startVx?: number; grounded?: boolean; rollMs?: number } = {}) {
  const run = createRunState();
  run.vx = options.startVx ?? 0;
  let rolling = (options.rollMs ?? 0) > 0;
  let x = 0;
  const toggles: { frame: number; rolling: boolean; vx: number; x: number }[] = [];
  const speeds: number[] = [];
  for (let frame = 0; frame < frames; frame++) {
    const boosted = frame * FRAME < (options.boostedUntil ?? -1);
    stepRun(PHYSICS, run, input(frame), options.grounded ?? true, boosted, FRAME);
    x += run.vx * FRAME / 1000;
    const next = nextRolling(PHYSICS, { rolling, speed: Math.abs(run.vx), blocked: false, timeLeft: (options.rollMs ?? 0) - (frame + 1) * FRAME });
    if (next !== rolling) toggles.push({ frame, rolling: next, vx: run.vx, x });
    rolling = next;
    speeds.push(run.vx);
  }
  return { run, rolling, toggles, speeds, x };
}

test('plain running reaches run speed quickly and never starts a roll', () => {
  const result = simulate(18, () => 1);
  assert.ok(result.run.vx >= PHYSICS.runSpeed - 1, `vx ${result.run.vx}`);
  assert.equal(result.rolling, false);
});

test('holding one direction sprints faster but speed alone never rolls', () => {
  const result = simulate(600, () => 1);
  assert.equal(result.toggles.length, 0);
  assert.equal(result.rolling, false);
  assert.ok(Math.abs(result.run.vx - PHYSICS.sprintSpeed) < 1, `vx ${result.run.vx}`);
});

test('a booster roll lasts rollMs and then the robot runs normally while still holding the direction', () => {
  const run = createRunState();
  run.vx = 150;
  applyBoost(PHYSICS, run, 1);
  assert.equal(run.vx, PHYSICS.boostLaunch);
  const result = simulate(300, () => 1, { startVx: run.vx, boostedUntil: PHYSICS.boostMs, rollMs: PHYSICS.rollMs });
  assert.deepEqual(result.toggles.map((toggle) => toggle.rolling), [false]);
  const seconds = (result.toggles[0].frame + 1) * FRAME / 1000;
  assert.ok(Math.abs(seconds - PHYSICS.rollMs / 1000) < 0.02, `rolled for ${seconds.toFixed(2)}s`);
  assert.ok(result.run.vx > PHYSICS.runSpeed, 'keeps its momentum after the roll');
});

test('releasing input during a booster roll leaves it early, once, and decelerates smoothly', () => {
  const result = simulate(300, (frame) => (frame < 30 ? 1 : 0), { startVx: PHYSICS.boostLaunch, boostedUntil: PHYSICS.boostMs, rollMs: PHYSICS.rollMs });
  assert.deepEqual(result.toggles.map((toggle) => toggle.rolling), [false]);
  assert.ok(result.toggles[0].frame * FRAME < PHYSICS.rollMs, 'before the roll time runs out');
  assert.ok(result.toggles[0].vx < PHYSICS.rollExitSpeed && result.toggles[0].vx > PHYSICS.rollExitSpeed - 20);
  for (let i = 31; i < result.speeds.length; i++) {
    if (i * FRAME < PHYSICS.boostMs) continue;
    assert.ok(result.speeds[i - 1] - result.speeds[i] <= Math.max(PHYSICS.groundDecel, PHYSICS.overspeedDrag) * FRAME / 1000 + 1e-9, 'no instant stop');
  }
  assert.equal(result.run.vx, 0);
});

test('turning around skids through zero instead of flipping velocity', () => {
  const result = simulate(120, (frame) => (frame < 40 ? 1 : -1));
  const limit = (PHYSICS.groundDecel + PHYSICS.groundAccel) * FRAME / 1000 + 1e-9;
  for (let i = 41; i < result.speeds.length; i++) assert.ok(Math.abs(result.speeds[i] - result.speeds[i - 1]) <= limit);
  const crossing = result.speeds.findIndex((vx, i) => i > 40 && vx <= 0);
  assert.equal(result.speeds[crossing], 0, 'passes through a standstill');
  assert.ok(result.speeds.at(-1)! < -PHYSICS.runSpeed + 1);
});

test('nothing but an active roll keeps rolling: no start from speed, a hit or used-up time ends it', () => {
  assert.equal(nextRolling(PHYSICS, { rolling: false, speed: PHYSICS.boostSpeed, blocked: false, timeLeft: PHYSICS.rollMs }), false);
  assert.equal(nextRolling(PHYSICS, { rolling: true, speed: PHYSICS.rollExitSpeed + 1, blocked: false, timeLeft: 1 }), true);
  assert.equal(nextRolling(PHYSICS, { rolling: true, speed: PHYSICS.rollExitSpeed - 1, blocked: false, timeLeft: PHYSICS.rollMs }), false);
  assert.equal(nextRolling(PHYSICS, { rolling: true, speed: PHYSICS.boostSpeed, blocked: true, timeLeft: PHYSICS.rollMs }), false);
  assert.equal(nextRolling(PHYSICS, { rolling: true, speed: PHYSICS.boostSpeed, blocked: false, timeLeft: 0 }), false);
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

test('a double tap of one direction asks for a spin dash; slow taps or a turn do not', () => {
  const taps = createTapState();
  assert.equal(registerTap(PHYSICS, taps, 1, 1000), false);
  assert.equal(registerTap(PHYSICS, taps, 1, 1000 + PHYSICS.doubleTapMs - 10), true);
  assert.equal(registerTap(PHYSICS, taps, 1, 1300), false, 'a third tap starts a new pair');
  assert.equal(registerTap(PHYSICS, taps, -1, 1350), false, 'other direction');
  assert.equal(registerTap(PHYSICS, taps, -1, 1350 + PHYSICS.doubleTapMs + 1), false, 'too slow');
});

test('a spin dash rolls for the dash only, carries without the button and has a cooldown', () => {
  const run = createRunState();
  const dash = createDashState();
  assert.equal(tryDash(PHYSICS, dash, run, 1, false, 0), undefined, 'ground only');
  const vx = tryDash(PHYSICS, dash, run, 1, true, 0);
  assert.equal(vx, PHYSICS.dashSpeed);
  assert.ok(PHYSICS.dashSpeed < PHYSICS.sprintSpeed, 'never farther than a full sprint');
  assert.ok(PHYSICS.dashSpeed >= PHYSICS.rollExitSpeed, 'fast enough to smash walls and enemies');

  // Button released right after the double tap: still rolling forward until the dash ends.
  let rolling = true;
  let t = FRAME;
  for (; t < PHYSICS.dashMs; t += FRAME) {
    stepRun(PHYSICS, run, dashDirection(dash, 0, t), true, false, FRAME);
    rolling = nextRolling(PHYSICS, { rolling, speed: Math.abs(run.vx), blocked: false, timeLeft: PHYSICS.dashMs - t });
  }
  assert.ok(rolling && run.vx > 0);
  assert.equal(nextRolling(PHYSICS, { rolling, speed: PHYSICS.dashSpeed, blocked: false, timeLeft: PHYSICS.dashMs - t }), false, 'the roll ends with the dash');
  assert.equal(dashDirection(dash, 0, PHYSICS.dashMs + 1), 0, 'dash over');
  assert.equal(tryDash(PHYSICS, dash, run, 1, true, PHYSICS.dashCooldownMs - 1), undefined, 'cooling down');
  assert.notEqual(tryDash(PHYSICS, dash, run, -1, true, PHYSICS.dashCooldownMs), undefined);
  assert.equal(dashDirection(dash, 1, PHYSICS.dashCooldownMs + FRAME), 1, 'pressing the other way ends the dash');
});
