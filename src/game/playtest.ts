/// <reference types="vite/client" />
// Dev-only play measurements, opt in with `?debug=1`: how a run of a stage actually went, in numbers.
// Real plays and bot runs stay apart by `source`: a run driven through the debug hooks (press/release/teleport)
// is a bot run, and a script that only fires DOM events sets window.__spinboundPlaytest.source = 'bot'.
// Production builds compile createPlaytest() to `undefined`, so none of this ships.

export type PlaytestSource = 'human' | 'bot';
export type PlaytestEvent = 'contact' | 'roll-kill' | 'dash' | 'dash-kill' | 'hit' | 'death' | 'respawn' | 'combo' | 'bonus-coins';
type Spot = { at: number; x: number; cause: string };

export type PlaytestRecord = {
  source: PlaytestSource;
  stage: number;
  // Tries of this stage since its last clear in this page session, this one included.
  attempt: number;
  result: 'clear' | 'death' | 'quit';
  // Active play seconds; the pause menu does not count.
  seconds: number;
  firstEnemyContact?: number;
  firstRollKill?: number;
  firstDash?: number;
  firstDashKill?: number;
  firstHit?: Spot;
  deaths: Spot[];
  respawns: number;
  hits: number;
  maxCombo: number;
  // Chains of two or more roll kills: their length and the seconds from the first kill to the last.
  combos: { count: number; seconds: number }[];
  bonusCoins: number;
  coins: number;
  topSpeed: number;
  clearSeconds?: number;
};

type Store = {
  source: PlaytestSource;
  records: PlaytestRecord[];
  attempts: Record<number, number>;
  clear(): void;
  last(): PlaytestRecord | undefined;
};

const KEY = 'spinbound:playtest:v1';
const enabled = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get('debug') === '1';

// One store per page; human records survive a reload, bot runs do not.
function store(): Store {
  const target = window as unknown as { __spinboundPlaytest?: Store };
  if (target.__spinboundPlaytest) return target.__spinboundPlaytest;
  let saved: PlaytestRecord[] = [];
  try { saved = JSON.parse(localStorage.getItem(KEY) ?? '[]') as PlaytestRecord[]; } catch { /* storage unavailable */ }
  const created: Store = {
    source: 'human',
    records: saved,
    attempts: {},
    clear() { this.records.length = 0; this.attempts = {}; try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ } },
    last() { return this.records[this.records.length - 1]; },
  };
  target.__spinboundPlaytest = created;
  return created;
}

const round = (seconds: number) => Math.round(seconds * 10) / 10;

export class PlaytestRecorder {
  private readonly store = store();
  private readonly record: PlaytestRecord;
  private seconds = 0;
  private chain: { count: number; first: number; last: number } | undefined;
  private done = false;
  private scripted = false;

  constructor(stage: number) {
    const attempt = (this.store.attempts[stage] ?? 0) + 1;
    this.store.attempts[stage] = attempt;
    this.record = {
      source: this.store.source, stage, attempt, result: 'quit', seconds: 0, deaths: [], respawns: 0, hits: 0,
      maxCombo: 0, combos: [], bonusCoins: 0, coins: 0, topSpeed: 0,
    };
  }

  // Scripted input reached this run: record it as a bot run.
  markScripted() {
    this.scripted = true;
  }

  tick(deltaMs: number, speed: number) {
    this.seconds += deltaMs / 1000;
    if (speed > this.record.topSpeed) this.record.topSpeed = Math.round(speed);
  }

  note(event: PlaytestEvent, x: number, detail: string | number = '') {
    const record = this.record;
    const at = round(this.seconds);
    if (event === 'contact') record.firstEnemyContact ??= at;
    else if (event === 'roll-kill') record.firstRollKill ??= at;
    else if (event === 'dash') record.firstDash ??= at;
    else if (event === 'dash-kill') record.firstDashKill ??= at;
    else if (event === 'hit') { record.hits += 1; record.firstHit ??= { at, x: Math.round(x), cause: String(detail) }; }
    else if (event === 'death') record.deaths.push({ at, x: Math.round(x), cause: String(detail) });
    else if (event === 'respawn') record.respawns += 1;
    else if (event === 'bonus-coins') record.bonusCoins += Number(detail);
    else if (event === 'combo') {
      const count = Number(detail);
      record.maxCombo = Math.max(record.maxCombo, count);
      if (count === 1) { this.closeChain(); this.chain = { count, first: this.seconds, last: this.seconds }; }
      else if (this.chain) { this.chain.count = count; this.chain.last = this.seconds; }
    }
  }

  finish(result: PlaytestRecord['result'], coins: number) {
    if (this.done) return;
    this.done = true;
    this.closeChain();
    const record = this.record;
    record.source = this.scripted ? 'bot' : this.store.source;
    record.result = result;
    record.seconds = round(this.seconds);
    record.coins = coins;
    if (result === 'clear') { record.clearSeconds = record.seconds; this.store.attempts[record.stage] = 0; }
    this.store.records.push(record);
    if (record.source === 'human') {
      try { localStorage.setItem(KEY, JSON.stringify(this.store.records.filter((entry) => entry.source === 'human'))); } catch { /* storage unavailable */ }
    }
  }

  private closeChain() {
    if (this.chain && this.chain.count >= 2) this.record.combos.push({ count: this.chain.count, seconds: round(this.chain.last - this.chain.first) });
    this.chain = undefined;
  }
}

export function createPlaytest(stageIndex: number): PlaytestRecorder | undefined {
  if (!enabled()) return undefined;
  return new PlaytestRecorder(stageIndex + 1);
}
