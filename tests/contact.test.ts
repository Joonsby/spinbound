import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMBAT, PHYSICS } from '../src/game/config.ts';
import { classifyContact, createContactBox, smashesWall, type ContactBox } from '../src/game/contact.ts';

const RULES = { stompTolerance: COMBAT.stompTolerance, minStompSpeed: COMBAT.minStompSpeed, minClosingSpeed: COMBAT.minClosingSpeed, rollExitSpeed: PHYSICS.rollExitSpeed };

// Player body 30x42, enemy body 34x36 standing on y=480.
function player(x: number, y: number, vx: number, vy: number, prevX = x - vx / 60, prevY = y - vy / 60): ContactBox {
  return { ...createContactBox(), x, y, prevX, prevY, width: 30, height: 42, vx, vy };
}
function enemy(x: number, vx = 0): ContactBox {
  return { ...createContactBox(), x, y: 444, prevX: x - vx / 60, prevY: 444, width: 34, height: 36, vx, vy: 0 };
}

test('falling onto the top is a stomp', () => {
  // Feet were 4px above the enemy top last step.
  assert.equal(classifyContact(player(100, 410, 0, 400, 100, 398), false, enemy(100), RULES), 'stomp');
});

test('being higher is not enough: a side hit or a rising jump is not a stomp', () => {
  // Centre above the enemy centre, but the feet were already below its top before this step.
  assert.equal(classifyContact(player(80, 420, 120, 200, 78, 415), false, enemy(100), RULES), 'touch');
  // Overlapping from below while rising.
  assert.equal(classifyContact(player(100, 400, 0, -300, 100, 395), false, enemy(100), RULES), 'touch');
});

test('a fast roll into an enemy ahead is an attack', () => {
  assert.equal(classifyContact(player(70, 438, 340, 0), true, enemy(100), RULES), 'roll');
  assert.equal(classifyContact(player(130, 438, -340, 0), true, enemy(100, 65), RULES), 'roll');
});

test('an enemy touching a rolling player from behind does not count as an attack', () => {
  // Rolling right, enemy on the left side.
  assert.equal(classifyContact(player(130, 438, 340, 0), true, enemy(100, 400), RULES), 'touch');
});

test('rolling flag alone is not enough: speed and closing speed matter', () => {
  assert.equal(classifyContact(player(70, 438, 200, 0), true, enemy(100), RULES), 'touch');
  assert.equal(classifyContact(player(70, 438, 300, 0), false, enemy(100), RULES), 'touch');
  // Enemy running away almost as fast as the roll.
  assert.equal(classifyContact(player(70, 438, 300, 0), true, enemy(100, 250), RULES), 'touch');
});

test('breakable walls only yield to a roll hitting their side face', () => {
  const wall = { left: 200, right: 236, top: 400 };
  assert.equal(smashesWall(player(172, 438, 340, 0, 168, 438), true, wall, RULES), true);
  assert.equal(smashesWall(player(222, 438, -340, 0, 236, 438), true, wall, RULES), true);
  assert.equal(smashesWall(player(172, 438, 340, 0, 168, 438), false, wall, RULES), false);
  assert.equal(smashesWall(player(172, 438, 200, 0, 168, 438), true, wall, RULES), false);
  // Landing on top while rolling.
  assert.equal(smashesWall(player(210, 360, 340, 300, 205, 355), true, wall, RULES), false);
  // Already overlapping from the far side.
  assert.equal(smashesWall(player(210, 438, 340, 0, 206, 438), true, wall, RULES), false);
});
