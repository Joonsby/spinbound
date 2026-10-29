// Central texture keys with their logical size and pivot. A PNG listed in
// public/assets/asset-manifest.json under the same key replaces the code-painted fallback;
// it must be drawn at @2x of the size below with the pivot at the same spot (docs/ASSET_MANIFEST.md).

export type PartSpec = { key: string; width: number; height: number; pivotX: number; pivotY: number; file: string };

const part = (key: string, width: number, height: number, pivotX: number, pivotY: number, file: string): PartSpec =>
  ({ key, width, height, pivotX, pivotY, file });

export const ROBOT_PARTS = {
  head: part('robot-head', 42, 36, 18, 33, 'characters/robot/head.png'),
  fin: part('robot-fin', 16, 20, 8, 18, 'characters/robot/fin.png'),
  torso: part('robot-torso', 22, 18, 11, 9, 'characters/robot/torso.png'),
  arm: part('robot-arm', 12, 16, 6, 3, 'characters/robot/arm.png'),
  leg: part('robot-leg', 8, 10, 4, 1.5, 'characters/robot/leg.png'),
  wheel: part('robot-wheel', 18, 18, 9, 9, 'characters/robot/wheel.png'),
  ball: part('robot-ball', 44, 44, 22, 22, 'characters/robot/ball.png'),
  ballShade: part('robot-ball-shade', 44, 44, 22, 22, 'characters/robot/ball-shade.png'),
  shadow: part('robot-shadow', 36, 10, 18, 5, 'characters/robot/shadow.png'),
};

export const ROBOT_EXPRESSIONS = ['normal', 'blink', 'happy', 'surprised', 'hurt', 'dead'] as const;
export type RobotExpression = typeof ROBOT_EXPRESSIONS[number];
export const eyesPart = (expression: RobotExpression) => part(`robot-eyes-${expression}`, 26, 16, 13, 8, `characters/robot/eyes-${expression}.png`);

// Rig anchor points in logical px, relative to the feet (0, 0) of a robot facing right.
// Head-local anchors are relative to the head pivot (the neck).
export const ROBOT_RIG = {
  neck: { x: 0.5, y: -23 },
  eyes: { x: 9.5, y: -14.5 },
  finNear: { x: -9.5, y: -27, angle: -26 },
  finFar: { x: 7.5, y: -28.5, angle: 20, scale: 0.85 },
  torso: { x: 0, y: -18 },
  shoulderFront: { x: 8, y: -21 },
  shoulderBack: { x: -8, y: -21 },
  hipFront: { x: 4.5, y: -13 },
  hipBack: { x: -4.5, y: -13 },
  wheelFront: { x: 6.8, y: -7.6 },
  wheelBack: { x: -6.8, y: -7.6 },
  ball: { x: 0, y: -19.5 },
  ballRadius: 19.5,
  wheelRadius: 7.6,
};

export const PORTRAIT_KEY = 'robot-portrait';
export const PORTRAIT_BLINK_KEY = 'robot-portrait-blink';

// Runtime manifest of real assets (relative to public/assets/). Empty until art is delivered.
export const MANIFEST_URL = 'assets/asset-manifest.json';
export type RuntimeManifest = { version: number; textures: Record<string, string> };
