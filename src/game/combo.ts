import type { ComboTuning } from './config';

// Engine-free roll-kill combo. The scene reports each enemy a roll defeats and applies the reward.

export type ComboState = { count: number; lastAt: number };
export type ComboReward = { count: number; rollMs: number; boostMs: number; speed: number; bonusCoins: number };

export function createComboState(): ComboState {
  return { count: 0, lastAt: -Infinity };
}

// A roll kill within windowMs of the last one adds to the chain; a later one starts over at 1.
// Every kill keeps the roll going; from the second on the roll also speeds up and pays bonus coins.
export function registerRollKill(t: ComboTuning, combo: ComboState, now: number): ComboReward {
  combo.count = now - combo.lastAt <= t.windowMs ? combo.count + 1 : 1;
  combo.lastAt = now;
  const chained = combo.count >= 2;
  return {
    count: combo.count,
    rollMs: t.rollExtendMs,
    boostMs: chained ? t.boostMs : 0,
    speed: chained ? Math.min(t.maxSpeed, t.baseSpeed + t.speedPerStep * (combo.count - 2)) : 0,
    bonusCoins: chained ? Math.min(t.maxBonusCoins, combo.count - 1) : 0,
  };
}

// Taking a hit ends the chain.
export function breakCombo(combo: ComboState) {
  combo.count = 0;
  combo.lastAt = -Infinity;
}
