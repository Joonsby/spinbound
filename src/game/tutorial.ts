// Tutorial tips already shown on this device (section indexes of the tutorial stage).
// Device-only like the sound setting; settings can clear it to show the tips again.
const KEY = 'spinbound:tutorial-seen:v1';

export function seenTips(): Set<number> {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(stored) ? stored.filter((index): index is number => Number.isInteger(index)) : []);
  } catch { return new Set(); }
}

export function markTipSeen(index: number) {
  const seen = seenTips().add(index);
  try { localStorage.setItem(KEY, JSON.stringify([...seen])); } catch { /* storage unavailable */ }
}

export function resetTips() {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}
