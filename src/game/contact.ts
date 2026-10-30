// Engine-free collision rules shared by enemies and breakable walls.
// Boxes use Arcade body conventions: x/y is the top-left, prev is the position before this step.

export type ContactBox = { x: number; y: number; prevX: number; prevY: number; width: number; height: number; vx: number; vy: number };
export type ContactKind = 'stomp' | 'roll' | 'touch';
export type ContactRules = { stompTolerance: number; minStompSpeed: number; minClosingSpeed: number; rollExitSpeed: number };

export function createContactBox(): ContactBox {
  return { x: 0, y: 0, prevX: 0, prevY: 0, width: 0, height: 0, vx: 0, vy: 0 };
}

// Stomp: the feet were above the target's top before this step and the player is falling onto it.
export function isStomp(player: ContactBox, target: ContactBox, rules: ContactRules) {
  return player.vy >= 0 && player.vy - target.vy > rules.minStompSpeed
    && player.prevY + player.height <= target.prevY + rules.stompTolerance;
}

// Roll hit: rolling fast, moving toward the side the target was on, and actually closing in.
// A target catching up from behind is on the opposite side of the velocity, so it never counts.
export function isRollHit(player: ContactBox, rolling: boolean, target: ContactBox, rules: ContactRules) {
  if (!rolling || Math.abs(player.vx) < rules.rollExitSpeed) return false;
  const side = Math.sign((target.prevX + target.width / 2) - (player.prevX + player.width / 2));
  if (side === 0 || side !== Math.sign(player.vx)) return false;
  return (player.vx - target.vx) * side >= rules.minClosingSpeed;
}

export function classifyContact(player: ContactBox, rolling: boolean, target: ContactBox, rules: ContactRules): ContactKind {
  if (isStomp(player, target, rules)) return 'stomp';
  return isRollHit(player, rolling, target, rules) ? 'roll' : 'touch';
}

// Breakable walls only give way to a roll that hits their side face, never to a landing.
export function smashesWall(player: ContactBox, rolling: boolean, wall: { left: number; right: number; top: number }, rules: ContactRules) {
  if (!rolling || Math.abs(player.vx) < rules.rollExitSpeed) return false;
  if (player.prevY + player.height <= wall.top + 4) return false;
  return player.vx > 0 ? player.prevX + player.width <= wall.left + 1 : player.prevX >= wall.right - 1;
}
