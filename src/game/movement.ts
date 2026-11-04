import type { MovementTuning } from './config';

// Engine-free movement rules. The scene feeds body state in and writes the result back,
// so the same code runs in the game and in `npm test`.

export type Direction = -1 | 0 | 1;

export type RunState = {
  vx: number;
  // Extra speed cap earned by holding one direction on the ground (0 … sprintSpeed - runSpeed).
  sprint: number;
  sprintHeldMs: number;
};

export type JumpState = {
  lastGroundedAt: number;
  jumpPressedAt: number;
  // Only a player jump can be cut short; springs, ropes and stomps keep their impulse.
  cuttable: boolean;
};

export function createRunState(): RunState {
  return { vx: 0, sprint: 0, sprintHeldMs: 0 };
}

export function createJumpState(): JumpState {
  return { lastGroundedAt: -Infinity, jumpPressedAt: -Infinity, cuttable: false };
}

function approach(value: number, target: number, step: number) {
  return value < target ? Math.min(target, value + step) : Math.max(target, value - step);
}

export function speedCap(t: MovementTuning, run: RunState, boosted: boolean) {
  return boosted ? t.boostSpeed : t.runSpeed + run.sprint;
}

export function stepRun(t: MovementTuning, run: RunState, direction: Direction, grounded: boolean, boosted: boolean, deltaMs: number) {
  const dt = Math.min(Math.max(deltaMs, 0), t.maxStepMs) / 1000;
  const moving = Math.sign(run.vx);
  const speed = Math.abs(run.vx);
  // Sprint momentum is kept in the air and lost on the ground when the run is broken.
  if (direction !== 0 && direction === moving && grounded && speed >= t.runSpeed + run.sprint - 5) {
    run.sprintHeldMs += deltaMs;
    if (run.sprintHeldMs >= t.sprintDelayMs) run.sprint = Math.min(t.sprintSpeed - t.runSpeed, run.sprint + t.sprintGain * dt);
  } else if (direction !== moving || (grounded && speed < t.runSpeed * 0.8)) {
    if (grounded || (direction !== 0 && direction !== moving)) { run.sprint = 0; run.sprintHeldMs = 0; }
  }
  const cap = speedCap(t, run, boosted);
  if (direction === 0) {
    run.vx = approach(run.vx, 0, (grounded ? t.groundDecel : t.airDrag) * dt);
  } else if (moving !== 0 && moving !== direction) {
    // Skid: brake against the current momentum before turning around.
    run.vx = approach(run.vx, 0, (grounded ? t.groundDecel + t.groundAccel : t.airAccel + t.airDrag) * dt);
  } else if (speed > cap) {
    // Keep surplus speed from boosters and springs, bleeding it off gradually.
    run.vx = direction * Math.max(cap, speed - (grounded ? t.overspeedDrag : t.airDrag) * dt);
  } else {
    const accel = !grounded ? t.airAccel : boosted ? t.boostAccel : t.groundAccel;
    run.vx = direction * Math.min(cap, speed + accel * dt);
  }
  return run.vx;
}

export function resetRun(run: RunState, vx = 0) {
  run.vx = vx; run.sprint = 0; run.sprintHeldMs = 0;
}

// A booster both launches the player and fills sprint momentum, so the roll survives the boost.
export function applyBoost(t: MovementTuning, run: RunState, direction: -1 | 1) {
  run.vx = direction * Math.max(Math.abs(run.vx), t.boostLaunch);
  run.sprint = t.sprintSpeed - t.runSpeed;
  run.sprintHeldMs = t.sprintDelayMs;
  return run.vx;
}

export type TapState = { direction: Direction; releasedAt: number };
export type DashState = { direction: Direction; until: number; readyAt: number; requested: Direction; requestedAt: number };

export function createTapState(): TapState {
  return { direction: 0, releasedAt: -Infinity };
}

export function createDashState(): DashState {
  return { direction: 0, until: -Infinity, readyAt: -Infinity, requested: 0, requestedAt: -Infinity };
}

// A press of the same direction within doubleTapMs of its last release asks for a spin dash: a quick
// second tap from a standstill, or one quick flick while running. The press after a dash starts over.
export function registerTap(t: MovementTuning, taps: TapState, direction: -1 | 1, now: number) {
  const dash = taps.direction === direction && now - taps.releasedAt <= t.doubleTapMs;
  taps.direction = dash ? 0 : direction;
  taps.releasedAt = -Infinity;
  return dash;
}

export function registerRelease(taps: TapState, direction: -1 | 1, now: number) {
  if (taps.direction === direction) taps.releasedAt = now;
}

export function requestDash(dash: DashState, direction: -1 | 1, now: number) {
  dash.requested = direction;
  dash.requestedAt = now;
}

// Spin dash from the ground: launches straight into a roll and fills sprint momentum, so holding
// the direction afterwards keeps rolling like a full sprint. A request waits up to dashBufferMs for the
// ground and the cooldown. Returns the new vx, or undefined.
export function tryDash(t: MovementTuning, dash: DashState, run: RunState, grounded: boolean, now: number) {
  if (dash.requested === 0) return undefined;
  if (now - dash.requestedAt > t.dashBufferMs) { dash.requested = 0; return undefined; }
  if (!grounded || now < dash.readyAt) return undefined;
  const direction = dash.requested;
  dash.requested = 0;
  dash.direction = direction;
  dash.until = now + t.dashMs;
  dash.readyAt = now + t.dashCooldownMs;
  const kept = Math.sign(run.vx) === direction ? Math.abs(run.vx) : 0;
  run.vx = direction * Math.max(kept, t.dashSpeed);
  run.sprint = t.sprintSpeed - t.runSpeed;
  run.sprintHeldMs = t.sprintDelayMs;
  return run.vx;
}

// During a dash a released button still moves in the dash direction; pressing the other way ends it.
export function dashDirection(dash: DashState, input: Direction, now: number): Direction {
  if (now >= dash.until) return input;
  if (input !== 0 && input !== dash.direction) { dash.until = -Infinity; return input; }
  return dash.direction;
}

export function noteGrounded(jump: JumpState, now: number) {
  jump.lastGroundedAt = now;
}

export function pressJump(jump: JumpState, now: number) {
  jump.jumpPressedAt = now;
}

// Jump buffer + coyote time. Returns the new vertical speed, or undefined when no jump starts.
export function tryJump(t: MovementTuning, jump: JumpState, now: number) {
  if (now - jump.jumpPressedAt > t.jumpBufferMs || now - jump.lastGroundedAt > t.coyoteMs) return undefined;
  jump.jumpPressedAt = -Infinity;
  jump.lastGroundedAt = -Infinity;
  jump.cuttable = true;
  return -t.jumpSpeed;
}

export function cutJump(t: MovementTuning, jump: JumpState, vy: number, held: boolean) {
  if (!jump.cuttable) return vy;
  if (vy >= 0) { jump.cuttable = false; return vy; }
  if (held) return vy;
  jump.cuttable = false;
  return Math.max(vy, -t.jumpCutSpeed);
}

export type RollCheck = { rolling: boolean; speed: number; blocked: boolean; timeLeft: number };

// A roll never starts here (boosters and spin dashes start it); it ends when its time runs out,
// when it slows below rollExitSpeed or on a hit. A roll that leaves the ground stays a spin attack.
export function nextRolling(t: MovementTuning, check: RollCheck) {
  return check.rolling && !check.blocked && check.timeLeft > 0 && check.speed >= t.rollExitSpeed;
}
