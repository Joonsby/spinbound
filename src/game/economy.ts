import type { EconomyTuning } from './config';

// Clear reward: every coin picked up in the stage plus a flat bonus.
export const clearReward = (stageCoins: number, tuning: EconomyTuning) => Math.max(0, Math.floor(stageCoins)) + tuning.clearBonus;

// A revive is offered only once a checkpoint was reached; paying for it needs enough coins.
export function reviveOffer(hasCheckpoint: boolean, balance: number, tuning: EconomyTuning) {
  return { offered: hasCheckpoint, canPay: hasCheckpoint && balance >= tuning.reviveCost, cost: tuning.reviveCost };
}
