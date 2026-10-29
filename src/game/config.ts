// Gameplay tuning in one place. Pure data: also imported by the Node tests.

export const PHYSICS = {
  gravity: 1100,
  maxFallSpeed: 900,
  // Horizontal speed caps (px/s).
  runSpeed: 270,
  // Holding one direction on the ground slowly raises the cap past rollEnterSpeed.
  sprintSpeed: 350,
  sprintDelayMs: 700,
  sprintGain: 60,
  boostSpeed: 430,
  boostLaunch: 400,
  boostMs: 1100,
  // Accelerations (px/s²).
  groundAccel: 1000,
  boostAccel: 1400,
  groundDecel: 750,
  airAccel: 550,
  airDrag: 160,
  overspeedDrag: 260,
  // Jumping.
  jumpSpeed: 570,
  jumpCutSpeed: 260,
  jumpBufferMs: 100,
  coyoteMs: 100,
  // Auto-roll hysteresis.
  rollEnterSpeed: 320,
  rollExitSpeed: 260,
  // Spin dash: double-tap a direction on the ground. Below sprintSpeed, so it never reaches farther than a full run.
  dashSpeed: 340,
  dashMs: 450,
  dashCooldownMs: 900,
  doubleTapMs: 260,
  maxStepMs: 50,
};
export type MovementTuning = typeof PHYSICS;

export const COMBAT = {
  invulnerableMs: 1000,
  knockbackMs: 220,
  knockbackSpeed: 260,
  knockbackLift: 220,
  stompBounce: 380,
  stompBounceHeld: 520,
  stompTolerance: 8,
  minStompSpeed: 30,
  minClosingSpeed: 100,
  recoilSpeed: 220,
  recoilLift: 240,
  enemyHitCooldownMs: 350,
  hitStopMs: 50,
  bossHitStopMs: 90,
  coinScore: 100,
  enemyScore: 200,
  bossScore: 2000,
  enemySpeed: 65,
  chargeSpeed: 210,
  // Damage is player attack (default 10) per hit; a recovering charger takes double.
  enemyHp: { patrol: 10, fly: 10, charger: 20 },
};
export type CombatTuning = typeof COMBAT;

// Coins kept between plays (the lobby balance).
export const ECONOMY = {
  // Added to the coins picked up in a cleared stage.
  clearBonus: 20,
  reviveCost: 50,
};
export type EconomyTuning = typeof ECONOMY;

// Pre-stage items (ITEMS in progress.ts).
export const BOOSTS = {
  // Coins this close to the robot fly in on their own.
  magnetRadius: 150,
};

export const GIMMICK = {
  springSpeed: 820,
  springDiagonalX: 420,
  springDiagonalY: 700,
  platformSpeed: 60,
  ropeGrabRadius: 34,
  ropeRegrabMs: 500,
  ropeMinGrip: 0.5,
  ropeMaxAngle: 1.05,
  ropePump: 1.6,
  ropeReleaseScale: 1.15,
  ropeReleaseJump: 300,
  ropeReleaseSteer: 60,
  ropeMaxReleaseX: 460,
  ropeMaxReleaseUp: 700,
};

export const BOSS = {
  maxHp: 60,
  phaseHp: [40, 20],
  warningMs: [1000, 950, 850],
  exposedMs: [2800, 2500, 2200],
  recoverMs: 900,
  chargeSpeed: [380, 450, 520],
  waveSpeed: [260, 290, 320],
  droneCount: [2, 2, 3],
  droneHp: 10,
  droneLifeMs: 9000,
  debrisCount: [3, 2, 3],
  debrisLifeMs: 2500,
  hitCooldownMs: 600,
};
