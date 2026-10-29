import type { StageData } from './stages';

// Worlds 2+ are generated: a seeded builder lays floors (horizontal runs) joined by connectors
// (stairs, elevators, springs, drops) so a stage can head right, left, up or down.
// Every gap, rise and drop stays inside the jump limits checked by tests/stages.test.ts.

const GROUND = 480;
// Vertical distance between stacked floors; more than a jump, so floors only connect where intended.
const STEP = 240;
// Open column at a floor's end where the connector to the next floor stands.
const SHAFT = 260;
const THICK = 30;
const MAX_BLOCK = 1000;

export const WORLD_NAMES = ['새싹 초원', '버섯 숲', '용암 협곡', '바람 고원', '안개 숲', '화산 공장', '구름 들판', '깊은 밀림', '불꽃 요새', '별빛 정상'];
export const STAGES_PER_WORLD = 10;
const BOSS_NAMES = ['FORGE-06', 'MOSS-20', 'MAGMA-30', 'GALE-40', 'FOG-50', 'IRON-60', 'CLOUD-70', 'JUNGLE-80', 'BLAZE-90', 'STAR-100'];

type Layout = 'run' | 'back' | 'climb' | 'descent' | 'bridge';
const LAYOUT_LABELS: Record<Layout, string> = { run: '질주', back: '되돌아가기', climb: '오르막', descent: '내리막', bridge: '구름다리' };
// Slots 1–9 of a world; slot 10 is the boss. Two plans alternate between worlds.
const PLANS: Layout[][] = [
  ['run', 'climb', 'back', 'bridge', 'descent', 'run', 'climb', 'back', 'descent'],
  ['run', 'descent', 'bridge', 'back', 'climb', 'run', 'bridge', 'descent', 'climb'],
];

type Kind = 'rest' | 'spike' | 'gap' | 'mover' | 'patrol' | 'fly' | 'charger' | 'spring' | 'boost' | 'block' | 'ledge' | 'rope';
type RunOptions = { pits: boolean; boosts: boolean; ropes: boolean; headroom: number; rests: number[] };

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Builder {
  readonly stage: StageData;
  readonly checkpoints: { x: number; y: number }[] = [];

  readonly rand: () => number;
  readonly difficulty: number;

  // Plain fields: the Node tests load this file with type stripping only.
  constructor(rand: () => number, difficulty: number, theme: StageData['theme'], name: string, width: number) {
    this.rand = rand;
    this.difficulty = difficulty;
    this.stage = {
      theme, name, width, checkpoint: { x: 0, y: 0 }, platforms: [], oneWayPlatforms: [], coins: [], spikes: [], traps: [],
      enemies: [], enemyDetails: [], pads: [], movingPlatforms: [], ropes: [], signs: [],
    };
  }

  between(min: number, max: number) { return Math.round(min + this.rand() * (max - min)); }

  // Solid floor from left to right with its top at `top`, minus the gaps.
  floor(left: number, right: number, top: number, gaps: [number, number][] = []) {
    const pieces: [number, number][] = [];
    let from = left;
    for (const [gapLeft, gapRight] of [...gaps].sort((a, b) => a[0] - b[0])) {
      if (gapLeft > from) pieces.push([from, gapLeft]);
      from = Math.max(from, gapRight);
    }
    if (right > from) pieces.push([from, right]);
    for (const [pieceLeft, pieceRight] of pieces) {
      for (let x = pieceLeft; x < pieceRight; x += MAX_BLOCK) {
        const width = Math.min(MAX_BLOCK, pieceRight - x);
        if (top === GROUND) this.stage.platforms.push([x + width / 2, GROUND + 60, width, 120]);
        else this.stage.platforms.push([x + width / 2, top + THICK / 2, width, THICK]);
      }
    }
  }

  coinLine(from: number, to: number, y: number, spacing: number) {
    for (let x = from; x <= to; x += spacing) this.stage.coins.push([Math.round(x), Math.round(y)]);
  }

  coinArc(centerX: number, y: number, width: number, height: number, count: number) {
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      this.stage.coins.push([Math.round(centerX - width / 2 + width * t), Math.round(y - Math.sin(t * Math.PI) * height)]);
    }
  }

  checkpoint(x: number, top: number) { this.checkpoints.push({ x: Math.round(x), y: top - 30 }); }
  sign(x: number, top: number, text: string) { this.stage.signs!.push({ x: Math.round(x), y: top - 100, text, floor: top }); }

  // Obstacles along one floor between `from` and `to`; returns the pits it opened.
  run(from: number, to: number, top: number, options: RunOptions) {
    const { stage, difficulty: d } = this;
    const gaps: [number, number][] = [];
    const rests = [...options.rests].sort((a, b) => a - b);
    const weights: [Kind, number][] = [
      ['spike', 3], ['patrol', 2], ['block', options.headroom >= 330 ? 1 : 0], ['ledge', options.headroom >= 300 ? 0.8 : 0],
      ['gap', options.pits ? 2 : 0], ['mover', options.pits && d >= 0.15 ? 0.9 : 0], ['fly', 1.2],
      ['charger', d >= 0.35 ? 0.7 : 0], ['spring', options.headroom >= 380 ? 0.8 : 0],
      ['boost', options.boosts ? 0.7 : 0], ['rope', options.ropes && d >= 0.2 ? 0.6 : 0],
    ];
    const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
    const pick = (): Kind => {
      let roll = this.rand() * total;
      for (const [kind, weight] of weights) if ((roll -= weight) < 0) return kind;
      return 'spike';
    };
    let x = from;
    for (;;) {
      const kind: Kind = rests.length && x + 240 >= rests[0] ? (rests.shift(), 'rest') : pick();
      const double = kind === 'spike' && d > 0.4 && this.rand() < 0.5;
      const gapWidth = kind === 'gap' ? this.between(100, 130 + 40 * d) : kind === 'mover' ? this.between(320, 420) : kind === 'rope' ? 440 : 0;
      const half = { rest: 90, spike: double ? 80 : 55, gap: gapWidth / 2 + 30, mover: gapWidth / 2 + 40, patrol: 110, fly: 120, charger: 185, spring: 60, boost: 60, block: 90, ledge: 100, rope: 260 }[kind];
      const c = x + half;
      if (c + half > to) break;
      if (kind === 'rest') {
        this.coinLine(c - 60, c + 60, top - 40, 60);
        this.checkpoint(c, top);
      } else if (kind === 'spike') {
        for (const spot of double ? [c - 22, c + 22] : [c]) {
          if (top === GROUND) stage.spikes.push(spot);
          else stage.traps!.push([spot, top - 15]);
        }
        this.coinArc(c, top - 60, double ? 150 : 120, 50, 3);
      } else if (kind === 'gap') {
        gaps.push([c - gapWidth / 2, c + gapWidth / 2]);
        this.coinArc(c, top - 50, gapWidth + 40, 60, 4);
      } else if (kind === 'mover') {
        const [left, right] = [c - gapWidth / 2, c + gapWidth / 2];
        gaps.push([left, right]);
        // Flush with the floor and docking at both edges, as in stage 1.
        stage.movingPlatforms.push({ x: left + 50, y: top + 10, axis: 'x', min: left + 50, max: right - 50, speed: Math.round(70 + 40 * d) });
        this.coinLine(left + 60, right - 60, top - 50, 70);
      } else if (kind === 'patrol' || kind === 'charger') {
        const reach = kind === 'patrol' ? 80 : 150;
        stage.enemyDetails!.push({ kind, x: c, y: top - 18, min: c - reach, max: c + reach });
        this.coinLine(c - 60, c + 60, top - 110, 60);
      } else if (kind === 'fly') {
        stage.enemyDetails!.push({ kind: 'fly', x: c, y: top - 95, min: c - 100, max: c + 100 });
        this.coinLine(c - 80, c + 80, top - 40, 80);
      } else if (kind === 'spring') {
        stage.pads.push([c, 'spring', top - 8]);
        for (const lift of [150, 220, 280]) stage.coins.push([c, top - lift]);
      } else if (kind === 'boost') {
        stage.pads.push([c, 'boost', top - 8]);
        this.coinLine(c + 90, c + 450, top - 40, 90);
        // Room to roll before the next obstacle.
        x += 420;
      } else if (kind === 'block') {
        stage.platforms.push([c, top - 35, 120, 70]);
        this.coinLine(c - 40, c + 40, top - 110, 40);
      } else if (kind === 'ledge') {
        stage.oneWayPlatforms!.push([c, top - 85 + 9, 170, 18]);
        this.coinLine(c - 60, c + 60, top - 120, 60);
      } else if (kind === 'rope') {
        gaps.push([c - 220, c + 220]);
        stage.ropes!.push({ x: c, y: top - 350, length: 230 });
        this.coinArc(c, top - 140, 260, 40, 4);
      }
      x = c + half + Math.round(this.between(150, 260) * (1 - 0.35 * d));
    }
    return gaps;
  }

  // Way up from floor `top` to `top - STEP` in the shaft beyond `edge`; `side` points into the shaft.
  connectUp(edge: number, top: number, side: 1 | -1, signX = edge - side * 90) {
    const { stage } = this;
    const kind = (['stairs', 'elevator', 'spring'] as const)[Math.floor(this.rand() * 3)];
    if (kind === 'stairs') {
      for (const [offset, rise] of [[190, 80], [70, 160]]) {
        const x = edge + side * offset;
        stage.oneWayPlatforms!.push([x, top - rise + 9, 100, 18]);
        stage.coins.push([x, top - rise - 40]);
      }
    } else if (kind === 'elevator') {
      const x = edge + side * 60;
      stage.movingPlatforms.push({ x, y: top - 10, axis: 'y', min: top - STEP + 10, max: top - 10, speed: 70 });
      for (const lift of [100, 160, 220]) stage.coins.push([x, top - lift]);
    } else {
      const x = edge + side * 130;
      stage.pads.push([x, 'spring', top - 8]);
      for (const lift of [120, 200, 270]) stage.coins.push([x, top - lift]);
    }
    this.sign(signX, top, '↑ 위로!');
  }

  finish(start: { x: number; top: number }, goal: { x: number; top: number }, highestTop: number) {
    const { stage } = this;
    stage.start = { x: start.x, y: start.top - 40 };
    stage.goal = { x: goal.x, y: goal.top - 60 };
    stage.top = Math.min(0, highestTop - 320);
    stage.checkpoints = this.checkpoints;
    stage.checkpoint = this.checkpoints[0] ?? { x: start.x, y: start.top - 30 };
    return stage;
  }
}

const round100 = (value: number) => Math.round(value / 100) * 100;

function runLayout(b: Builder) {
  const width = round100(3000 + 1500 * b.difficulty + b.rand() * 600);
  const rests = width < 3200 ? [width * 0.5] : [width * 0.36, width * 0.68];
  const gaps = b.run(420, width - 330, GROUND, { pits: true, boosts: true, ropes: true, headroom: 600, rests });
  b.floor(0, width, GROUND, gaps);
  b.stage.width = width;
  return b.finish({ x: 90, top: GROUND }, { x: width - 130, top: GROUND }, GROUND);
}

// A run played right to left.
function backLayout(b: Builder) {
  const stage = runLayout(b);
  const width = stage.width;
  const flip = (x: number) => width - x;
  stage.platforms = stage.platforms.map(([x, y, w, h]) => [flip(x), y, w, h]);
  stage.oneWayPlatforms = stage.oneWayPlatforms!.map(([x, y, w, h]) => [flip(x), y, w, h]);
  stage.coins = stage.coins.map(([x, y]) => [flip(x), y]);
  stage.spikes = stage.spikes.map(flip);
  stage.traps = stage.traps!.map(([x, y]) => [flip(x), y]);
  stage.enemyDetails = stage.enemyDetails!.map((enemy) => ({ ...enemy, x: flip(enemy.x), min: flip(enemy.max), max: flip(enemy.min) }));
  stage.pads = stage.pads.map(([x, kind, y]) => [flip(x), kind === 'spring-left' ? 'spring-right' : kind === 'spring-right' ? 'spring-left' : kind, y]);
  stage.movingPlatforms = stage.movingPlatforms.map((platform) => platform.axis === 'x'
    ? { ...platform, x: flip(platform.max), min: flip(platform.max), max: flip(platform.min) }
    : { ...platform, x: flip(platform.x) });
  stage.ropes = stage.ropes!.map((rope) => ({ ...rope, x: flip(rope.x) }));
  stage.checkpoints = stage.checkpoints!.map((point) => ({ ...point, x: flip(point.x) })).reverse();
  stage.checkpoint = stage.checkpoints[0] ?? stage.checkpoint;
  stage.start = { ...stage.start!, x: flip(stage.start!.x) };
  stage.goal = { ...stage.goal!, x: flip(stage.goal!.x) };
  stage.signs = [{ x: width - 300, y: GROUND - 100, text: '← 왼쪽으로!', floor: GROUND }];
  return stage;
}

// Zigzag up: right on the ground, then each floor turns back one storey higher.
function climbLayout(b: Builder) {
  const floors = 2 + (b.difficulty > 0.5 && b.rand() < 0.6 ? 1 : 0);
  const width = round100(2400 + 700 * b.difficulty + b.rand() * 400);
  b.stage.width = width;
  let goal = { x: 0, top: GROUND };
  for (let k = 0; k <= floors; k++) {
    const top = GROUND - STEP * k;
    const dir = k % 2 === 0 ? 1 : -1;
    const last = k === floors;
    // Floors after the ground start at the previous shaft and run to the far wall.
    const left = k === 0 || dir === -1 ? 0 : SHAFT;
    const right = k === 0 || dir === 1 ? width : width - SHAFT;
    const from = dir === 1 ? (k === 0 ? 420 : left + 300) : (last ? 330 : SHAFT + 120);
    const to = dir === 1 ? (last ? width - 330 : width - SHAFT - 120) : right - 300;
    // Only the top floor has open sky; pits above the ground drop to the floor below.
    const gaps = b.run(from, to, top, { pits: k > 0, boosts: false, ropes: false, headroom: last ? 600 : 210, rests: [] });
    b.floor(left, right, top, gaps);
    if (k > 0) {
      b.checkpoint(dir === 1 ? left + 150 : right - 150, top);
      b.sign(dir === 1 ? left + 220 : right - 220, top, dir === 1 ? '→' : '←');
    }
    if (last) goal = { x: dir === 1 ? width - 130 : 130, top };
    else b.connectUp(dir === 1 ? width - SHAFT : SHAFT, top, dir);
  }
  return b.finish({ x: 90, top: GROUND }, goal, GROUND - STEP * floors);
}

// Zigzag down: start high, drop off each floor's end to the one below.
function descentLayout(b: Builder) {
  const floors = 2 + (b.difficulty > 0.5 && b.rand() < 0.6 ? 1 : 0);
  const width = round100(2400 + 700 * b.difficulty + b.rand() * 400);
  b.stage.width = width;
  let goal = { x: 0, top: GROUND };
  for (let k = floors; k >= 0; k--) {
    const top = GROUND - STEP * k;
    const dir = (floors - k) % 2 === 0 ? 1 : -1;
    const first = k === floors;
    // Each floor covers the shaft it is dropped into and stops short of its own drop.
    const left = k === 0 || dir === 1 ? 0 : SHAFT;
    const right = k === 0 || dir === -1 ? width : width - SHAFT;
    const from = dir === 1 ? (first ? 400 : 330) : SHAFT + (k === 0 ? 210 : 150);
    const to = dir === 1 ? (k === 0 ? width - 330 : width - SHAFT - 150) : width - SHAFT - 200;
    const gaps = b.run(from, to, top, { pits: k === 0, boosts: false, ropes: false, headroom: first ? 600 : 210, rests: [] });
    b.floor(left, right, top, gaps);
    if (!first) b.checkpoint(dir === -1 ? width - SHAFT - 40 : SHAFT + 40, top);
    if (k > 0) b.sign(dir === 1 ? width - SHAFT - 90 : SHAFT + 90, top, '↓ 아래로!');
    if (k === 0) goal = { x: dir === 1 ? width - 130 : 130, top };
  }
  return b.finish({ x: 90, top: GROUND - STEP * floors }, goal, GROUND - STEP * floors);
}

// Up onto a sky bridge over a wall, then back down to the ground.
function bridgeLayout(b: Builder) {
  const width = round100(3800 + 800 * b.difficulty + b.rand() * 400);
  const bridgeLeft = round100(width * 0.3);
  const bridgeRight = round100(width * 0.72);
  const wall = round100((bridgeLeft + bridgeRight) / 2);
  const high = GROUND - STEP;
  b.stage.width = width;
  const before = b.run(420, bridgeLeft - SHAFT - 160, GROUND, { pits: true, boosts: true, ropes: false, headroom: 600, rests: [] });
  const after = b.run(bridgeRight + 300, width - 330, GROUND, { pits: true, boosts: true, ropes: false, headroom: 600, rests: [] });
  b.floor(0, width, GROUND, [...before, ...after]);
  // The wall props up the bridge and closes the way underneath it.
  b.stage.platforms.push([wall, (high + THICK + GROUND) / 2, 80, GROUND - high - THICK]);
  b.coinLine(bridgeLeft + 80, wall - 120, GROUND - 40, 90);
  b.connectUp(bridgeLeft, GROUND, -1, bridgeLeft - SHAFT - 70);
  const bridgeGaps = b.run(bridgeLeft + 280, bridgeRight - 150, high, { pits: true, boosts: false, ropes: false, headroom: 600, rests: [] });
  b.floor(bridgeLeft, bridgeRight, high, bridgeGaps);
  b.checkpoint(bridgeLeft + 150, high);
  b.sign(bridgeRight - 90, high, '↓ 아래로!');
  b.checkpoint(bridgeRight + 150, GROUND);
  return b.finish({ x: 90, top: GROUND }, { x: width - 130, top: GROUND }, high);
}

function bossLayout(b: Builder, world: number) {
  const approach = round100(2000 + 600 * b.difficulty);
  const width = approach + 1400;
  b.stage.width = width;
  const gaps = b.run(420, approach - 200, GROUND, { pits: true, boosts: true, ropes: false, headroom: 600, rests: [approach * 0.5] });
  b.floor(0, width, GROUND, gaps);
  b.checkpoint(approach + 20, GROUND);
  // Arena boosters on both halves keep a roll in reach wherever the boss stops.
  b.stage.pads.push([approach + 250, 'boost'], [width - 250, 'boost']);
  b.stage.boss = { entry: approach + 80, left: approach, right: width, x: width - 150, y: 432, level: world, name: BOSS_NAMES[world - 1] };
  b.stage.sections = [
    { x: 0, title: `${WORLD_NAMES[world - 1]} · 보스 전`, hint: '체크포인트를 지나면 보스가 기다려요' },
    { x: approach - 80, title: `보스 · ${BOSS_NAMES[world - 1]}`, hint: '예고를 보고 피한 뒤 약점이 열리면 스핀 대시·밟기!' },
  ];
  return b.finish({ x: 90, top: GROUND }, { x: width - 130, top: GROUND }, GROUND);
}

// Stage `slot` (1–10) of `world` (2+), always the same layout for the same pair.
export function generateStage(world: number, slot: number): StageData {
  const rand = seeded(world * 7919 + slot * 104729);
  const difficulty = Math.min(1, ((world - 2) * STAGES_PER_WORLD + slot) / 90);
  const theme = ((world - 1) % 3) as StageData['theme'];
  const worldName = WORLD_NAMES[world - 1];
  if (slot === STAGES_PER_WORLD) return bossLayout(new Builder(rand, difficulty, theme, `${worldName} · 보스`, 0), world);
  const layout = PLANS[world % 2][slot - 1];
  const builder = new Builder(rand, difficulty, theme, `${worldName} · ${LAYOUT_LABELS[layout]}`, 0);
  const build = { run: runLayout, back: backLayout, climb: climbLayout, descent: descentLayout, bridge: bridgeLayout }[layout];
  return build(builder);
}

export const worldOf = (stageIndex: number) => Math.floor(stageIndex / STAGES_PER_WORLD) + 1;
