import type { MovementTuning } from '../src/game/config.ts';
import { createDashState, createRunState, createTapState, registerRelease, registerTap, requestDash, tryDash, type Direction } from '../src/game/movement.ts';

// Synthetic touch input for the spin dash, fixed before comparing tap windows (tests/dash-input.test.ts).
// Timing sources: a touch tap lasts about 60–180 ms (Android counts presses under 100 ms as taps);
// a quick double tap comes back 50–250 ms after the release (Android accepts up to 300 ms as a double
// tap, a quick one is well inside that); deliberate one-step nudges wait to see the robot move
// (about 250 ms to react plus the tap), so they repeat no faster than every 450 ms.

export type Control = 'left' | 'right' | 'jump';
export type InputEvent = { at: number; control: Control; down: boolean };
export type Scenario = {
  group: string;
  name: string;
  // Intended: the player means to dash. Otherwise any dash is an accident.
  intended: boolean;
  expectDash: boolean;
  events: InputEvent[];
  // Airborne until this time (ms); grounded throughout when absent.
  landing?: number;
  // A dash already happened at this time, so the cooldown is running.
  priorDashAt?: number;
  until: number;
};

const press = (at: number, control: Control): InputEvent => ({ at, control, down: true });
const lift = (at: number, control: Control): InputEvent => ({ at, control, down: false });
// A tap of `control` held for `hold` ms starting at `at`.
const tap = (at: number, hold: number, control: Control = 'right') => [press(at, control), lift(at + hold, control)];

const HOLDS = [60, 100, 140, 180];
const QUICK_GAPS = [50, 100, 150, 200, 250];
const NUDGE_HOLDS = [80, 120, 160];
const NUDGE_PERIODS = [450, 550, 650];

export function scenarios(): Scenario[] {
  const list: Scenario[] = [];
  // Intended dashes.
  for (const hold of HOLDS) for (const gap of QUICK_GAPS) {
    list.push({ group: '정지 상태 빠른 두 번 탭', name: `누름 ${hold} · 간격 ${gap}`, intended: true, expectDash: true,
      events: [...tap(100, hold), press(100 + hold + gap, 'right')], until: 1200 });
  }
  for (const gap of QUICK_GAPS) {
    list.push({ group: '달리다 떼었다 다시 누르기', name: `1.5초 누른 뒤 간격 ${gap}`, intended: true, expectDash: true,
      events: [press(0, 'right'), lift(1500, 'right'), press(1500 + gap, 'right')], until: 2400 });
  }
  for (const early of [20, 60, 100, 140]) {
    // Second press lands `early` ms before touchdown; the dash should fire on landing.
    const second = 1000 - early;
    list.push({ group: '착지 직전 대시 입력', name: `착지 ${early}ms 전`, intended: true, expectDash: true,
      events: [...tap(second - 220, 100), press(second, 'right')], landing: 1000, until: 1600 });
  }
  for (const gap of [100, 200]) {
    // Other thumb on jump the whole time, or a jump tap between the two direction taps.
    list.push({ group: '좌우와 점프 멀티터치', name: `점프 누른 채 두 번 탭 · 간격 ${gap}`, intended: true, expectDash: true,
      events: [press(0, 'jump'), ...tap(200, 100), press(300 + gap, 'right'), lift(900, 'jump')], until: 1200 });
    list.push({ group: '좌우와 점프 멀티터치', name: `두 번 탭 사이 점프 탭 · 간격 ${gap}`, intended: true, expectDash: true,
      events: [...tap(200, 100), ...tap(310, 40, 'jump'), press(300 + gap, 'right')], until: 1200 });
  }
  for (const second of [780, 830, 880]) {
    list.push({ group: '대시 쿨다운 중 입력', name: `직전 대시 ${second}ms 뒤 (쿨다운 끝 150ms 안)`, intended: true, expectDash: true,
      events: [...tap(second - 220, 100), press(second, 'right')], priorDashAt: 0, until: 1600 });
  }
  // Inputs that must not dash.
  for (const hold of NUDGE_HOLDS) for (const period of NUDGE_PERIODS) {
    const events = [0, 1, 2, 3].flatMap((i) => tap(100 + i * period, hold));
    list.push({ group: '정밀 이동 끊어 누르기', name: `누름 ${hold} · ${period}ms마다 4번`, intended: false, expectDash: false, events, until: 100 + 4 * period + 300 });
  }
  for (const gap of [50, 100, 150, 200]) {
    list.push({ group: '방향 전환', name: `오른쪽 탭 뒤 ${gap}ms에 왼쪽`, intended: false, expectDash: false,
      events: [...tap(100, 100), press(200 + gap, 'left')], until: 1200 });
  }
  list.push({ group: '방향 전환', name: '좌우 흔들기 (100ms 탭, 100ms 간격)', intended: false, expectDash: false,
    events: [...tap(100, 100), ...tap(300, 100, 'left'), ...tap(500, 100), ...tap(700, 100, 'left')], until: 1400 });
  for (const early of [250, 400, 600]) {
    // Steering taps high in the air: long gone by the time the robot lands.
    const second = 1000 - early;
    list.push({ group: '점프 중 방향 입력', name: `착지 ${early}ms 전 두 번 탭`, intended: false, expectDash: false,
      events: [...tap(second - 220, 100), press(second, 'right')], landing: 1000, until: 1600 });
  }
  for (const second of [300, 500, 650]) {
    list.push({ group: '대시 쿨다운 중 입력', name: `직전 대시 ${second}ms 뒤 (쿨다운 끝보다 150ms 넘게 이름)`, intended: false, expectDash: false,
      events: [...tap(second - 220, 100), press(second, 'right')], priorDashAt: 0, until: 1600 });
  }
  for (const taps of [2, 4]) {
    list.push({ group: '좌우와 점프 멀티터치', name: `오른쪽을 누른 채 점프 ${taps}번`, intended: false, expectDash: false,
      events: [press(0, 'right'), ...Array.from({ length: taps }, (_, i) => tap(300 + i * 180, 90, 'jump')).flat(), lift(1400, 'right')], until: 1600 });
  }
  return list;
}

// Runs one scenario through the dash rules at the given frame rate. With `eventTiming` the taps are
// timed by their own event times (the game since round 2); without it, by the frame that polled them.
export function simulate(t: MovementTuning, scenario: Scenario, fps = 60, eventTiming = true) {
  const taps = createTapState();
  const dash = createDashState();
  const run = createRunState();
  if (scenario.priorDashAt !== undefined) { requestDash(dash, 1, scenario.priorDashAt); tryDash(t, dash, run, true, scenario.priorDashAt); }
  const events = [...scenario.events].sort((a, b) => a.at - b.at);
  const frameMs = 1000 / fps;
  let pending: Direction = 0;
  let next = 0;
  let dashedAt: number | undefined;
  for (let now = frameMs; now <= scenario.until; now += frameMs) {
    while (next < events.length && events[next].at <= now) {
      const event = events[next++];
      if (event.control === 'jump') continue;
      const direction = event.control === 'left' ? -1 : 1;
      const at = eventTiming ? event.at : now;
      if (event.down) { if (registerTap(t, taps, direction, at)) pending = direction; } else registerRelease(taps, direction, at);
    }
    if (pending !== 0) { requestDash(dash, pending, now); pending = 0; }
    const grounded = scenario.landing === undefined || now >= scenario.landing;
    if (tryDash(t, dash, run, grounded, now) !== undefined) dashedAt ??= now;
  }
  return { dashed: dashedAt !== undefined, at: dashedAt };
}

// Share of intended inputs that dash, and of the rest that dash anyway.
export function rates(t: MovementTuning, fps = 60, eventTiming = true) {
  const list = scenarios();
  const results = list.map((scenario) => ({ scenario, ...simulate(t, scenario, fps, eventTiming) }));
  const intended = results.filter((result) => result.scenario.intended);
  const accidental = results.filter((result) => !result.scenario.intended);
  return {
    intendedSuccess: intended.filter((result) => result.dashed).length / intended.length,
    accidentalRate: accidental.filter((result) => result.dashed).length / accidental.length,
    intended: intended.length, accidental: accidental.length,
    misses: results.filter((result) => result.dashed !== result.scenario.expectDash).map((result) => `${result.scenario.group} · ${result.scenario.name}: ${result.dashed ? '대시함' : '대시 안 함'}`),
  };
}
