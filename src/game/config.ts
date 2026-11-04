// Gameplay tuning in one place. Pure data: also imported by the Node tests.

export const PHYSICS = {
  gravity: 1100,
  maxFallSpeed: 900,
  // Horizontal speed caps (px/s).
  runSpeed: 270,
  // Holding one direction on the ground slowly raises the cap; speed alone never starts a roll.
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
  // Rolls start only from a booster (rollMs) or a spin dash (dashMs) and end early below rollExitSpeed.
  rollMs: 2500,
  rollExitSpeed: 260,
  // Spin dash: double-tap a direction on the ground. Below sprintSpeed, so it never reaches farther than a full run.
  dashSpeed: 340,
  dashMs: 450,
  dashCooldownMs: 900,
  // The second press counts from the last release of that direction, so a running thumb needs one quick flick;
  // a double tap just before landing waits dashBufferMs for the ground.
  doubleTapMs: 260,
  dashBufferMs: 150,
  maxStepMs: 50,
};
export type MovementTuning = typeof PHYSICS;

// Roll-kill combo (tried on stage 1, StageData.rollCombo): roll kills within windowMs of each other chain.
// Every roll kill keeps the roll going a little longer; from the second on it also speeds the roll up and pays coins.
export const COMBO = {
  windowMs: 1800,
  rollExtendMs: 400,
  boostMs: 900,
  baseSpeed: 420,
  speedPerStep: 20,
  maxSpeed: 450,
  maxBonusCoins: 4,
};
export type ComboTuning = typeof COMBO;

// HP is stored in hits (a plain hit costs 1); screens show it in points.
export const HP_POINTS = 100;

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
  // Stage 1 only: an enemy that just hurt the robot waits this long past the robot's invulnerability,
  // so walking back into it never costs a second hit the moment the blinking stops.
  tutorialRehitMs: 700,
  coinScore: 100,
  enemyScore: 200,
  enemySpeed: 65,
  chargeSpeed: 210,
  // Damage is player attack (default 10) per hit; a recovering charger takes double.
  enemyHp: { patrol: 10, fly: 10, charger: 20, hopper: 10 },
  // Hopper: rests, crouches, then arcs forward along its range.
  hopCycleMs: 1500,
  hopAirMs: 620,
  hopHeight: 64,
  hopSpeed: 95,
};
export type CombatTuning = typeof COMBAT;

// Coins kept between plays (the lobby balance).
export const ECONOMY = {
  // Added to the coins picked up in a cleared stage.
  clearBonus: 20,
  reviveCost: 300,
  // First clear of a world's last stage, growing per world; comes with one of every item.
  worldBonus: 500,
  worldBonusPerWorld: 150,
  // Clear reward multiplier on dragon, pursuit and time attack stages.
  modeBonus: 1.5,
};
export type EconomyTuning = typeof ECONOMY;

// Permanent coin upgrades (강화 menu): each level adds `step`; costs[i] buys level i + 1.
export const UPGRADES = {
  attack: { base: 10, step: 2, costs: [400, 600, 900, 1300, 1800, 2400, 3200, 4200, 5400, 6800] },
  defense: { base: 0, step: 5, costs: [600, 1000, 1500, 2200, 3000, 4000, 5200, 6600] },
  maxHp: { base: 3, step: 1, costs: [1200, 2800, 6000] },
};
export type UpgradeRule = { base: number; step: number; costs: number[] };
export type StatKey = keyof typeof UPGRADES;

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
