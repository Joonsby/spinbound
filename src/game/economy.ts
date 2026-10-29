import type { EconomyTuning } from './config';

// Clear reward: every coin picked up in the stage plus a flat bonus.
export const clearReward = (stageCoins: number, tuning: EconomyTuning) => Math.max(0, Math.floor(stageCoins)) + tuning.clearBonus;

// Special reward for the first clear of a boss stage.
export const bossBonus = (level: number, tuning: EconomyTuning) => tuning.bossBonus + tuning.bossBonusPerLevel * (level - 1);

// A revive is offered only once a checkpoint was reached; paying for it needs enough coins.
export function reviveOffer(hasCheckpoint: boolean, balance: number, tuning: EconomyTuning) {
  return { offered: hasCheckpoint, canPay: hasCheckpoint && balance >= tuning.reviveCost, cost: tuning.reviveCost };
}

type Wallet = { currency: number; items: string[] };

// Pays for one item and puts it in the bag; false (nothing changes) when the balance is too low.
export function buyItem(wallet: Wallet, id: string, price: number) {
  if (wallet.currency < price) return false;
  wallet.currency -= price;
  wallet.items.push(id);
  return true;
}

// Takes one of each chosen item out of the bag and returns the ones that were there.
export function takeItems(items: string[], chosen: readonly string[]) {
  const used: string[] = [];
  for (const id of new Set(chosen)) {
    const at = items.indexOf(id);
    if (at < 0) continue;
    items.splice(at, 1);
    used.push(id);
  }
  return used;
}
