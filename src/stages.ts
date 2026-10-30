export type EnemyKind = 'patrol' | 'fly' | 'charger';
export type PadKind = 'spring' | 'spring-left' | 'spring-right' | 'boost';

// The extension lets the Node tests load this module directly.
import { generateStage, STAGES_PER_WORLD, WORLD_NAMES } from './stage-gen.ts';

export type StageData = {
  theme: 0 | 1 | 2;
  name: string;
  width: number;
  checkpoint: { x: number; y: number };
  checkpoints?: { x: number; y: number }[];
  goalY?: number;
  // Generated stages: spawn and goal anywhere, and the highest point the camera may show.
  start?: { x: number; y: number };
  goal?: { x: number; y: number };
  top?: number;
  oneWayPlatforms?: [number, number, number, number][];
  enemyDetails?: { kind: EnemyKind; x: number; y: number; min: number; max: number }[];
  traps?: [number, number][];
  rewards?: { x: number; y: number; score: number }[];
  sections?: { x: number; title: string; hint: string }[];
  // Entering a section pauses the game once to explain it (tutorial stage).
  tutorial?: boolean;
  signs?: { x: number; y: number; text: string; floor?: number }[];
  // Pendulum ropes: anchor point and rope length.
  ropes?: { x: number; y: number; length: number }[];
  // Optional walls that only a fast roll breaks; never on the only route.
  walls?: { x: number; y: number; width?: number; height?: number }[];
  platforms: [number, number, number, number][];
  coins: [number, number][];
  spikes: number[];
  enemies: [number, number][];
  pads: [number, PadKind, number?][];
  movingPlatforms: { x: number; y: number; axis: 'x' | 'y'; min: number; max: number; speed?: number }[];
};

export const GROUND_TOP = 480;

function groundRuns(stage: StageData, runs: [number, number][]) {
  // Short terrain chunks keep procedural tile textures within mobile GPU limits.
  for (const [from, to] of runs) {
    for (let left = from; left < to; left += 1000) {
      const width = Math.min(1000, to - left);
      stage.platforms.push([left + width / 2, GROUND_TOP + 60, width, 120]);
    }
  }
}
function coinLine(stage: StageData, from: number, to: number, y: number, spacing: number) {
  for (let x = from; x <= to; x += spacing) stage.coins.push([x, y]);
}
function coinArc(stage: StageData, centerX: number, y: number, width: number, height: number, count: number) {
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    stage.coins.push([Math.round(centerX - width / 2 + width * t), Math.round(y - Math.sin(t * Math.PI) * height)]);
  }
}

// Stage 1 teaches one idea per section, in order:
// move/jump → spring → booster roll → roll attack → stomp → moving platform → rope → breakable wall → all together.
// A checkpoint sits before every pit so a fall never replays more than one section.
const STAGE_ONE: StageData = {
  theme: 0, name: '새벽 초원의 대모험', width: 12000, tutorial: true,
  checkpoint: { x: 4700, y: 450 },
  checkpoints: [{ x: 4700, y: 450 }, { x: 5950, y: 450 }, { x: 7050, y: 450 }, { x: 10000, y: 450 }],
  platforms: [
    [1950, 450, 500, 300],
    // Roof of the hidden tunnel; both tunnel ends are breakable walls.
    [8750, 385, 400, 30],
  ],
  oneWayPlatforms: [[800, 395, 180, 18], [4950, 380, 220, 18], [10560, 280, 300, 18]],
  coins: [], spikes: [620, 1000], enemies: [],
  enemyDetails: [
    { kind: 'patrol', x: 3420, y: 462, min: 3340, max: 3500 },
    { kind: 'patrol', x: 4120, y: 462, min: 4060, max: 4200 },
    { kind: 'patrol', x: 4360, y: 462, min: 4300, max: 4440 },
    { kind: 'patrol', x: 4980, y: 462, min: 4880, max: 5080 },
    { kind: 'fly', x: 5350, y: 390, min: 5250, max: 5450 },
    { kind: 'fly', x: 5700, y: 390, min: 5600, max: 5800 },
    { kind: 'patrol', x: 9610, y: 462, min: 9560, max: 9660 },
    { kind: 'patrol', x: 9810, y: 462, min: 9760, max: 9860 },
    { kind: 'charger', x: 11400, y: 462, min: 11250, max: 11600 },
  ],
  pads: [[1500, 'spring'], [2650, 'boost'], [3800, 'boost'], [8250, 'boost'], [9420, 'boost'], [10200, 'spring-right']],
  // Flush with the floor and docking at both edges, so boarding is a matter of timing, not a precise jump.
  movingPlatforms: [{ x: 6150, y: 490, axis: 'x', min: 6150, max: 6550, speed: 110 }],
  ropes: [{ x: 7520, y: 130, length: 230 }, { x: 10820, y: 120, length: 230 }],
  walls: [{ x: 8568, y: 440 }, { x: 8932, y: 440 }],
  rewards: [{ x: 2120, y: 250, score: 500 }, { x: 8750, y: 440, score: 1000 }, { x: 10640, y: 240, score: 500 }],
  sections: [
    { x: 0, title: '01 · 첫걸음', hint: '← → 이동 · 점프로 가시 넘기 · 멈추지 않고 달리면 탄력이 붙어요' },
    { x: 1300, title: '02 · 스프링', hint: '주황 스프링을 밟으면 점프보다 훨씬 높이 튀어요' },
    { x: 2450, title: '03 · 부스터와 구르기', hint: '청록 부스터로 빨라지면 자동으로 공처럼 굴러요' },
    { x: 3200, title: '04 · 구르기 공격', hint: '구르는 중 적과 부딪히면 처치 · 이동 버튼 두 번 톡톡이면 바로 스핀 대시' },
    { x: 4700, title: '05 · 밟기 공격', hint: '적 위로 떨어지면 밟기 · 점프를 누르고 있으면 더 높이 튀어요' },
    { x: 5900, title: '06 · 움직이는 발판', hint: '발판이 가장자리에 붙을 때 올라타 구덩이를 건너요' },
    { x: 7000, title: '07 · 줄 매달리기', hint: '점프해서 줄에 닿으면 자동으로 잡아요 · 점프로 놓기' },
    { x: 8100, title: '08 · 부서지는 벽', hint: '구르면서 금 간 벽에 부딪히면 숨겨진 길이 열려요' },
    { x: 9300, title: '09 · 종합 질주', hint: '부스터 → 구르기 → 대각 스프링 → 줄 → 깃발까지!' },
  ],
  signs: [
    { x: 300, y: 380, text: '← → 이동 · 점프로 가시 넘기' },
    { x: 1380, y: 380, text: '스프링 ↑ 높이 점프' },
    { x: 2520, y: 380, text: '부스터 » 빨라지면 자동 구르기' },
    { x: 3200, y: 380, text: '구르며 부딪히면 적 처치' },
    { x: 3780, y: 380, text: '두 번 톡톡 » 스핀 대시' },
    { x: 4520, y: 380, text: '쭉 달리면 탄력이 붙어 굴러요' },
    { x: 5160, y: 330, text: '위에서 떨어지면 밟기 공격' },
    { x: 6000, y: 300, text: '발판을 타고 건너기' },
    { x: 7150, y: 300, text: '점프 → 줄 잡기 → 점프로 놓기' },
    { x: 8130, y: 380, text: '구르기로 금 간 벽 부수기' },
    { x: 11150, y: 380, text: '돌진이 끝난 직후가 기회!' },
  ],
};
groundRuns(STAGE_ONE, [[0, 1700], [2200, 6100], [6600, 7300], [7750, 10600], [11050, 12000]]);
coinLine(STAGE_ONE, 200, 520, 440, 80);
coinArc(STAGE_ONE, 620, 420, 110, 50, 3);
coinLine(STAGE_ONE, 740, 860, 360, 60);
coinArc(STAGE_ONE, 1000, 420, 110, 50, 3);
coinLine(STAGE_ONE, 1100, 1400, 440, 100);
STAGE_ONE.coins.push([1560, 330], [1640, 260]);
coinLine(STAGE_ONE, 1760, 2080, 270, 64);
coinLine(STAGE_ONE, 2750, 3200, 440, 90);
coinLine(STAGE_ONE, 3560, 3760, 440, 100);
coinLine(STAGE_ONE, 4500, 4640, 440, 70);
coinArc(STAGE_ONE, 5350, 340, 120, 30, 3);
coinArc(STAGE_ONE, 5700, 335, 120, 30, 3);
coinLine(STAGE_ONE, 6220, 6500, 380, 70);
STAGE_ONE.coins.push([7420, 320], [7610, 330], [7690, 300]);
coinLine(STAGE_ONE, 8600, 8900, 340, 60);
coinLine(STAGE_ONE, 8620, 8700, 440, 40);
coinLine(STAGE_ONE, 8800, 8880, 440, 40);
coinLine(STAGE_ONE, 9500, 9900, 440, 100);
coinLine(STAGE_ONE, 10450, 10690, 245, 60);
STAGE_ONE.coins.push([10900, 310], [10980, 290]);
coinLine(STAGE_ONE, 11150, 11750, 440, 100);

// World 1 is hand-made; worlds 2–10 come from the generator (stage-gen.ts).
const WORLD_ONE: StageData[] = [
  STAGE_ONE,
  {
    theme: 1, name: '위험한 다리 · 보통', width: 2600, checkpoint: { x: 1680, y: 450 },
    platforms: [
      [325, 550, 650, 140], [1130, 550, 640, 140], [1835, 550, 430, 140], [2410, 550, 380, 140],
      [430, 380, 120, 18], [1120, 370, 140, 18], [1370, 300, 110, 18], [1850, 365, 140, 18],
    ],
    coins: [[230, 445], [430, 345], [730, 375], [900, 435], [1120, 335], [1240, 435], [1370, 265], [1530, 375], [1680, 435], [1850, 330], [2135, 340], [2380, 410], [2440, 435]],
    spikes: [550, 1000, 1330, 1980, 2310],
    enemies: [[300, 480], [1080, 1200], [1770, 1900], [2370, 2460]], pads: [],
    movingPlatforms: [
      { x: 730, y: 420, axis: 'x', min: 680, max: 780 },
      { x: 2135, y: 420, axis: 'y', min: 320, max: 450 },
    ],
  },
  {
    theme: 2, name: '가속 돌파 · 마지막 질주', width: 4400, checkpoint: { x: 1690, y: 450 },
    checkpoints: [{ x: 1690, y: 450 }, { x: 3020, y: 450 }],
    platforms: [
      [360, 550, 720, 140], [1170, 550, 580, 140], [1880, 550, 520, 140], [3350, 600, 2100, 240],
      [420, 382, 120, 18], [620, 300, 100, 18], [1080, 378, 130, 18], [1330, 300, 110, 18], [1840, 370, 140, 18], [2510, 380, 160, 18],
    ],
    coins: [[230, 445], [330, 445], [420, 345], [620, 265], [790, 375], [950, 435], [1080, 340], [1190, 430], [1330, 265], [1530, 375], [1690, 435], [1840, 335], [1950, 415], [2220, 375], [2380, 435], [2510, 345], [2640, 435], [2880, 435], [2990, 435], [3220, 410], [3420, 435], [3560, 400], [3700, 435], [3860, 435], [4000, 400], [4140, 435]],
    spikes: [560, 1010, 1270, 1780, 2010, 2460, 2740],
    enemies: [[300, 490], [1060, 1200], [1850, 1950], [2830, 2970]],
    pads: [[260, 'spring'], [1390, 'boost'], [2380, 'spring'], [2640, 'boost'], [3250, 'boost'], [4150, 'boost']],
    sections: [
      { x: 0, title: '03 · 가속 돌파', hint: '스프링과 부스터로 속도를 붙여 굴러서 돌파하세요' },
      { x: 2950, title: '03 · 마지막 질주', hint: '부스터로 속도를 올려 골까지 굴러가세요' },
    ],
    movingPlatforms: [
      { x: 790, y: 420, axis: 'x', min: 735, max: 845 },
      { x: 2220, y: 420, axis: 'y', min: 320, max: 450 },
    ],
  },
  {
    theme: 0, name: '바람의 언덕 · 도약', width: 3600, checkpoint: { x: 1950, y: 450 },
    platforms: [
      [400, 550, 800, 140], [1330, 550, 740, 140], [2260, 550, 760, 140], [3210, 550, 780, 140],
      [440, 380, 150, 18], [680, 295, 120, 18], [1230, 375, 140, 18], [1530, 295, 120, 18], [2300, 375, 140, 18], [3100, 370, 150, 18],
    ],
    coins: [[230, 435], [440, 345], [680, 260], [880, 365], [1080, 435], [1230, 340], [1530, 260], [1790, 365], [1950, 430], [2150, 435], [2300, 340], [2520, 430], [2730, 365], [2940, 430], [3100, 335], [3320, 435]],
    spikes: [570, 1390, 2450, 3230], enemies: [[1060, 1180], [2070, 2200], [3310, 3410]],
    pads: [[700, 'spring'], [2510, 'boost']],
    movingPlatforms: [{ x: 880, y: 415, axis: 'x', min: 820, max: 940 }, { x: 2730, y: 415, axis: 'y', min: 320, max: 440 }],
  },
  {
    theme: 1, name: '버섯 숲길 · 순찰', width: 3900, checkpoint: { x: 1760, y: 450 },
    platforms: [
      [325, 550, 650, 140], [1170, 550, 680, 140], [2050, 550, 700, 140], [2950, 550, 700, 140], [3690, 550, 420, 140],
      [410, 375, 120, 18], [1110, 375, 130, 18], [1390, 285, 100, 18], [2210, 365, 140, 18], [2940, 365, 120, 18], [3670, 375, 120, 18],
    ],
    coins: [[240, 435], [410, 340], [740, 360], [950, 435], [1110, 340], [1390, 250], [1605, 360], [1760, 435], [1940, 435], [2210, 330], [2500, 355], [2750, 435], [2940, 330], [3190, 435], [3390, 355], [3670, 340], [3750, 435]],
    spikes: [580, 990, 1280, 2310, 2710, 3200, 3580],
    enemies: [[280, 370], [1150, 1240], [1950, 2090], [3010, 3120], [3660, 3750]],
    pads: [[520, 'spring'], [2050, 'boost'], [2850, 'spring']],
    movingPlatforms: [{ x: 740, y: 410, axis: 'x', min: 680, max: 800 }, { x: 1605, y: 410, axis: 'y', min: 305, max: 445 }, { x: 3390, y: 410, axis: 'x', min: 3330, max: 3450 }],
  },
  {
    theme: 2, name: '용암 운반선 · 왕복', width: 4200, checkpoint: { x: 2000, y: 450 },
    platforms: [
      [380, 550, 760, 140], [1350, 550, 780, 140], [2320, 550, 760, 140], [3260, 550, 680, 140], [4000, 550, 400, 140],
      [500, 365, 120, 18], [1190, 370, 130, 18], [1580, 285, 110, 18], [2370, 355, 130, 18], [3220, 370, 140, 18],
    ],
    coins: [[230, 435], [500, 330], [860, 350], [1080, 435], [1190, 335], [1580, 250], [1840, 350], [2000, 435], [2230, 435], [2370, 320], [2590, 435], [2810, 350], [3090, 435], [3220, 335], [3500, 435], [3700, 350], [4000, 435]],
    spikes: [600, 1280, 1650, 2120, 2510, 3050, 3450, 3910],
    enemies: [[300, 440], [1360, 1500], [2190, 2310], [3260, 3380], [3960, 4050]],
    pads: [[670, 'boost'], [1500, 'spring'], [2590, 'boost'], [3500, 'spring']],
    movingPlatforms: [{ x: 860, y: 405, axis: 'y', min: 290, max: 445 }, { x: 1840, y: 415, axis: 'x', min: 1770, max: 1910 }, { x: 2810, y: 405, axis: 'y', min: 305, max: 445 }, { x: 3700, y: 420, axis: 'x', min: 3630, max: 3770 }],
  },
  {
    theme: 0, name: '하늘 정원 · 연속 점프', width: 4500, checkpoint: { x: 1830, y: 450 },
    platforms: [
      [350, 550, 700, 140], [1240, 550, 680, 140], [2140, 550, 720, 140], [3090, 550, 740, 140], [4090, 550, 820, 140],
      [490, 365, 120, 18], [1160, 350, 130, 18], [1460, 250, 110, 18], [2200, 355, 130, 18], [3000, 350, 130, 18], [3290, 250, 110, 18], [4060, 355, 130, 18],
    ],
    coins: [[240, 435], [490, 330], [800, 345], [1050, 435], [1160, 315], [1460, 215], [1680, 345], [1830, 435], [2200, 320], [2400, 435], [2610, 345], [2850, 435], [3000, 315], [3290, 215], [3570, 345], [3850, 435], [4060, 320], [4300, 435]],
    spikes: [580, 1080, 1500, 1960, 2400, 2860, 3360, 3930, 4240],
    enemies: [[270, 380], [1230, 1370], [2040, 2160], [3120, 3230], [4090, 4200]],
    pads: [[620, 'spring'], [1390, 'spring'], [2310, 'boost'], [3380, 'spring'], [4310, 'boost']],
    movingPlatforms: [{ x: 800, y: 400, axis: 'x', min: 730, max: 870 }, { x: 1680, y: 410, axis: 'y', min: 290, max: 445 }, { x: 2610, y: 400, axis: 'x', min: 2530, max: 2690 }, { x: 3570, y: 410, axis: 'y', min: 290, max: 445 }],
  },
  {
    theme: 1, name: '깊은 숲의 질주 · 가속', width: 4800, checkpoint: { x: 2000, y: 450 },
    platforms: [
      [380, 550, 760, 140], [1340, 550, 720, 140], [2280, 550, 720, 140], [3220, 550, 720, 140], [4300, 550, 1000, 140],
      [420, 370, 130, 18], [1210, 355, 130, 18], [1540, 260, 110, 18], [2310, 355, 140, 18], [3200, 350, 120, 18], [4160, 355, 140, 18], [4500, 270, 110, 18],
    ],
    coins: [[240, 435], [420, 335], [870, 345], [1100, 435], [1210, 320], [1540, 225], [1810, 345], [2000, 435], [2310, 320], [2520, 435], [2750, 345], [3010, 435], [3200, 315], [3460, 435], [3690, 345], [3950, 435], [4160, 320], [4500, 235], [4620, 435]],
    spikes: [550, 1130, 1480, 2180, 2510, 3000, 3420, 4000, 4440, 4580],
    enemies: [[280, 380], [1270, 1400], [2250, 2370], [3220, 3340], [4180, 4350]],
    pads: [[650, 'boost'], [1570, 'spring'], [2570, 'boost'], [3500, 'boost'], [4360, 'spring']],
    movingPlatforms: [{ x: 870, y: 400, axis: 'x', min: 790, max: 950 }, { x: 1810, y: 410, axis: 'y', min: 285, max: 445 }, { x: 2750, y: 400, axis: 'x', min: 2670, max: 2830 }, { x: 3690, y: 410, axis: 'y', min: 285, max: 445 }],
  },
  {
    theme: 2, name: '화산 심장부 · 복합 함정', width: 5100, checkpoint: { x: 2070, y: 450 },
    platforms: [
      [400, 550, 800, 140], [1400, 550, 760, 140], [2380, 550, 760, 140], [3360, 550, 760, 140], [4330, 550, 740, 140], [5000, 550, 200, 140],
      [490, 350, 120, 18], [1260, 355, 120, 18], [1610, 255, 110, 18], [2390, 345, 120, 18], [3240, 350, 120, 18], [3570, 250, 110, 18], [4310, 350, 130, 18],
    ],
    coins: [[240, 435], [490, 315], [910, 340], [1120, 435], [1260, 320], [1610, 220], [1890, 340], [2070, 435], [2390, 310], [2640, 435], [2870, 340], [3090, 435], [3240, 315], [3570, 215], [3850, 340], [4090, 435], [4310, 315], [4570, 435], [4800, 340], [4980, 435]],
    spikes: [560, 1160, 1480, 1680, 2210, 2610, 3090, 3490, 3650, 4110, 4560],
    enemies: [[290, 420], [1300, 1420], [2290, 2430], [3300, 3410], [4210, 4370]],
    pads: [[700, 'spring'], [1570, 'boost'], [2670, 'spring'], [3600, 'boost'], [4610, 'spring']],
    movingPlatforms: [{ x: 910, y: 395, axis: 'y', min: 280, max: 445 }, { x: 1890, y: 405, axis: 'x', min: 1810, max: 1970 }, { x: 2870, y: 395, axis: 'y', min: 280, max: 445 }, { x: 3850, y: 405, axis: 'x', min: 3770, max: 3930 }, { x: 4800, y: 405, axis: 'y', min: 300, max: 445 }],
  },
  {
    theme: 2, name: '마지막 새싹 · 최종 도전', width: 5500, checkpoint: { x: 2910, y: 450 },
    platforms: [
      [370, 550, 740, 140], [1320, 550, 720, 140], [2260, 550, 720, 140], [3200, 550, 720, 140], [4140, 550, 720, 140], [5110, 550, 780, 140],
      [440, 350, 120, 18], [1200, 345, 120, 18], [1520, 245, 110, 18], [2250, 345, 130, 18], [3130, 340, 120, 18], [3430, 245, 110, 18], [4110, 345, 130, 18], [4960, 340, 120, 18], [5260, 245, 110, 18],
    ],
    coins: [[240, 435], [440, 315], [850, 335], [1100, 435], [1200, 310], [1520, 210], [1790, 335], [2030, 435], [2250, 310], [2470, 435], [2730, 335], [2910, 435], [3130, 305], [3430, 210], [3670, 335], [3910, 435], [4110, 310], [4370, 435], [4610, 335], [4870, 435], [4960, 305], [5260, 210], [5350, 435]],
    spikes: [540, 1080, 1450, 1580, 2070, 2490, 3020, 3350, 3450, 3920, 4350, 4890, 5210],
    enemies: [[280, 390], [1250, 1370], [2160, 2320], [3150, 3280], [4090, 4240], [5020, 5150]],
    pads: [[650, 'spring'], [1530, 'boost'], [2530, 'spring'], [3470, 'boost'], [4400, 'spring'], [5290, 'boost']],
    movingPlatforms: [{ x: 850, y: 390, axis: 'x', min: 770, max: 930 }, { x: 1790, y: 400, axis: 'y', min: 270, max: 445 }, { x: 2730, y: 390, axis: 'x', min: 2650, max: 2810 }, { x: 3670, y: 400, axis: 'y', min: 270, max: 445 }, { x: 4610, y: 390, axis: 'x', min: 4530, max: 4690 }],
  },
];

export const STAGES: StageData[] = [
  ...WORLD_ONE,
  ...Array.from({ length: (WORLD_NAMES.length - 1) * STAGES_PER_WORLD }, (_, index) =>
    generateStage(Math.floor(index / STAGES_PER_WORLD) + 2, index % STAGES_PER_WORLD + 1)),
];
