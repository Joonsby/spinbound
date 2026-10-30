import { HP_POINTS, PHYSICS } from './config';
import { RARITY_LABELS, type Character } from '../characters';

const SPEED_STEPS = 24;

const element = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

// Matches the modal-out animation in style.css.
export const MODAL_CLOSE_MS = 180;

// Shows a modal overlay; calling it on an open one replays the entrance animation.
function openModal(overlay: HTMLElement) {
  overlay.classList.remove('modal-closing');
  if (!overlay.hidden) {
    overlay.hidden = true;
    void overlay.offsetWidth;
  }
  overlay.hidden = false;
}

// Plays the exit animation, then hides; opening it again meanwhile keeps it shown.
function closeModal(overlay: HTMLElement) {
  if (overlay.hidden || overlay.classList.contains('modal-closing')) return;
  overlay.classList.add('modal-closing');
  window.setTimeout(() => {
    if (!overlay.classList.contains('modal-closing')) return;
    overlay.classList.remove('modal-closing');
    overlay.hidden = true;
  }, MODAL_CLOSE_MS);
}

// Instant hide for scene changes.
function dropModal(overlay: HTMLElement) {
  overlay.classList.remove('modal-closing');
  overlay.hidden = true;
}

function stat(iconClass: string, label: string, value: number | string, unit: string) {
  const item = document.createElement('span');
  const mark = document.createElement('i');
  const number = document.createElement('strong');
  item.className = 'result-stat';
  mark.className = iconClass;
  mark.setAttribute('aria-hidden', 'true');
  number.textContent = `${value}${unit}`;
  item.append(mark, label, number);
  return item;
}

// DOM HUD. Every setter skips the write when the shown value is unchanged.
export class Hud {
  private status = element<HTMLParagraphElement>('#status');
  private score = element('#score');
  private coins = element('#coin-count');
  private hp = element('#hp');
  private hpValue = element('#hp-value');
  private hpChip = element('.chip-hp');
  private coinChip = element('.chip-coin');
  private stage = element('#stage-label');
  private speedHud = element('#speed-hud');
  private progress = element('#run-progress');
  private progressMarks = element('#run-progress .run-marks');
  private timer = element('#run-progress .run-timer');
  private chaser = element('#run-progress .run-chaser');
  private danger = element('#danger');
  private result = element('#result');
  private resultTitle = element('#result-title');
  private resultStats = element('#result-stats');
  readonly nextButton = element<HTMLButtonElement>('#result-next');
  readonly restartButton = element<HTMLButtonElement>('#result-restart');
  readonly doubleButton = element<HTMLButtonElement>('#result-double');
  readonly reviveAdButton = element<HTMLButtonElement>('#revive-ad');
  readonly reviveCoinButton = element<HTMLButtonElement>('#revive-coins');
  readonly reviveSkipButton = element<HTMLButtonElement>('#revive-skip');
  private reward = element('#result-reward');
  private worldBonus = element('#result-bonus');
  private unlock = element('#unlock');
  private unlockRarity = element('#unlock-rarity');
  private unlockPortrait = element<HTMLImageElement>('#unlock-portrait');
  private unlockName = element('#unlock-name');
  private unlockMore = element('#unlock-more');
  readonly unlockEquipButton = element<HTMLButtonElement>('#unlock-equip');
  readonly unlockKeepButton = element<HTMLButtonElement>('#unlock-keep');
  private revive = element('#revive');
  private reviveInfo = element('#revive-info');
  private tip = element('#tip');
  private pause = element('#pause-menu');
  private pauseCard = element('.pause-card');
  private pauseStage = element('#pause-stage');
  private pauseStats = element('#pause-stats');
  private pausePanel = element('#pause-panel');
  private pauseSettings = element<HTMLButtonElement>('#pause-settings');
  readonly pauseButton = element<HTMLButtonElement>('#pause');
  readonly resumeButton = element<HTMLButtonElement>('#pause-resume');
  readonly tipsResetButton = element<HTMLButtonElement>('#pause-tips');
  private tipStep = element('#tip-step');
  private tipTitle = element('#tip-title');
  private tipText = element('#tip-text');
  readonly tipButton = element<HTMLButtonElement>('#tip-continue');
  private shownSpeed = -1;
  private shownRolling: boolean | undefined;
  private shownStatus = '';
  private shownHp = '';
  private shownProgress = -1;
  private shownReached = -2;
  // Undefined until the first write, so a new stage always resets what the last one left.
  private shownTimer: string | undefined;
  private shownChaser: number | undefined;
  private shownDanger: number | undefined;

  constructor() {
    this.speedHud.style.setProperty('--roll-mark', String(PHYSICS.rollEnterSpeed / PHYSICS.boostSpeed));
    this.pauseSettings.onclick = () => this.togglePauseSettings(this.pausePanel.hidden);
  }

  setStage(index: number, total: number) { this.stage.textContent = `STAGE ${index + 1} / ${total}`; }

  setStatus(text: string) {
    if (text === this.shownStatus) return;
    this.shownStatus = text;
    this.status.textContent = text;
  }

  setScore(points: number, coins: number) {
    this.score.textContent = String(points);
    this.coins.textContent = String(coins);
  }

  setHp(hp: number, maxHp: number) {
    const text = `${hp} / ${maxHp}`;
    if (text === this.shownHp) return;
    this.shownHp = text;
    const points = Math.ceil(hp * HP_POINTS - 1e-6);
    this.hp.setAttribute('aria-label', `HP ${points} / ${maxHp * HP_POINTS}`);
    this.hp.style.setProperty('--hp-ratio', String(Math.max(0, Math.min(1, hp / maxHp))));
    this.hp.classList.toggle('low', hp / maxHp <= 0.34);
    this.hpValue.textContent = String(points);
  }

  // Active pre-stage items show as marks on the HP and coin chips.
  setBoosts(shield: boolean, magnet: boolean) {
    this.hpChip.classList.toggle('shielded', shield);
    this.coinChip.classList.toggle('magnet', magnet);
  }

  // Checkpoint diamonds at their share of the route.
  setProgressMarks(shares: number[]) {
    this.progressMarks.replaceChildren(...shares.map((share) => {
      const mark = document.createElement('i');
      mark.style.setProperty('--at', share.toFixed(4));
      return mark;
    }));
    this.shownProgress = -1;
    this.shownReached = -2;
  }

  // share: 0–1 of the route; reached: index of the last checkpoint touched (-1 for none).
  setProgress(share: number, reached: number) {
    const step = Math.round(share * 400) / 400;
    if (step !== this.shownProgress) {
      this.shownProgress = step;
      this.progress.style.setProperty('--progress', String(step));
      this.progress.setAttribute('aria-valuenow', String(Math.round(step * 100)));
    }
    if (reached !== this.shownReached) {
      this.shownReached = reached;
      Array.from(this.progressMarks.children).forEach((mark, index) => mark.classList.toggle('reached', index <= reached));
    }
  }

  // Time attack clock; null hides it.
  setTimer(ms: number | null) {
    const text = ms === null ? '' : (Math.ceil(ms / 100) / 10).toFixed(1);
    if (text === this.shownTimer) return;
    this.shownTimer = text;
    this.timer.hidden = ms === null;
    this.timer.textContent = text;
    this.timer.classList.toggle('low', ms !== null && ms < 10000);
  }

  // Dragon or thief on the progress bar; null hides it.
  setChaser(share: number | null, kind: 'dragon' | 'thief' = 'dragon') {
    const step = share === null ? -1 : Math.max(0, Math.round(share * 400) / 400);
    if (step === this.shownChaser) return;
    this.shownChaser = step;
    this.chaser.hidden = share === null;
    this.chaser.dataset.kind = kind;
    this.progress.style.setProperty('--chaser', String(Math.max(0, step)));
  }

  // Red glow on the left edge as the dragon closes in (0–1).
  setDanger(level: number) {
    const step = Math.round(level * 20) / 20;
    if (step === this.shownDanger) return;
    this.shownDanger = step;
    this.danger.style.setProperty('--danger', String(step));
  }

  setSpeed(speed: number, rolling: boolean) {
    const step = Math.round(Math.min(1, speed / PHYSICS.boostSpeed) * SPEED_STEPS);
    if (step !== this.shownSpeed) {
      this.shownSpeed = step;
      this.speedHud.style.setProperty('--speed', String(step / SPEED_STEPS));
    }
    if (rolling !== this.shownRolling) {
      this.shownRolling = rolling;
      this.speedHud.classList.toggle('rolling', rolling);
    }
  }

  showResult(outcome: 'clear' | 'over', title: string, score: number, coins: number, showNext: boolean, restartLabel: string) {
    this.result.dataset.outcome = outcome;
    this.resultTitle.textContent = title;
    this.resultStats.replaceChildren(stat('icon icon-star', '점수 ', score, '점'), stat('coin-icon', '코인 ', coins, '개'));
    this.nextButton.hidden = !showNext;
    this.restartButton.textContent = restartLabel;
    openModal(this.result);
    (showNext ? this.nextButton : this.restartButton).focus({ preventScroll: true });
  }

  // Clear reward under the stats; null hides it (game over). The ad button shows until the reward is doubled.
  setReward(amount: number | null, doubled = false) {
    this.reward.hidden = amount === null;
    this.doubleButton.hidden = amount === null || doubled;
    this.doubleButton.disabled = false;
    if (amount !== null) this.reward.replaceChildren(stat('coin-icon', doubled ? '보상 2배 ' : '보상 ', doubled ? amount * 2 : amount, '코인'));
  }

  // First clear of a world's last stage: bonus coins plus one of every item.
  setWorldBonus(coins: number | null) {
    this.worldBonus.hidden = coins === null;
    if (coins !== null) this.worldBonus.replaceChildren(stat('coin-icon', '월드 첫 클리어 ', coins, '코인'), stat('icon icon-box', '아이템 ', 3, '종'));
  }

  showUnlock(character: Character, portrait: string, remaining: number) {
    this.unlock.dataset.rarity = character.rarity;
    this.unlockRarity.textContent = RARITY_LABELS[character.rarity];
    this.unlockPortrait.src = portrait;
    this.unlockPortrait.alt = character.name;
    this.unlockName.textContent = character.name;
    this.unlockMore.textContent = remaining > 1 ? `새 캐릭터 ${remaining - 1}개가 더 있어요` : '';
    openModal(this.unlock);
    this.unlockEquipButton.focus({ preventScroll: true });
  }

  hideUnlock() { closeModal(this.unlock); }

  showRevive(cost: number, balance: number) {
    this.reviveCoinButton.textContent = `코인 ${cost}개로 부활`;
    this.reviveCoinButton.disabled = balance < cost;
    const note = document.createElement('span');
    note.textContent = '마지막 체크포인트에서 HP를 가득 채워 이어 해요';
    this.reviveInfo.replaceChildren(note, stat('coin-icon', '보유 ', balance, '개'));
    openModal(this.revive);
    this.reviveAdButton.focus({ preventScroll: true });
  }

  // Tutorial card over the paused game; the hint's " · " parts become separate lines.
  showTip(step: number, total: number, title: string, hint: string) {
    this.tipStep.textContent = `TIP ${step} / ${total}`;
    this.tipTitle.textContent = title;
    this.tipText.replaceChildren(...hint.split(' · ').map((line) => {
      const item = document.createElement('li');
      item.textContent = line;
      return item;
    }));
    openModal(this.tip);
    this.tipButton.focus({ preventScroll: true });
  }

  hideTip() { closeModal(this.tip); }

  hideRevive() { closeModal(this.revive); }

  // items: icon names of the active pre-stage items, shown together in one chip.
  showPause(stage: string, stats: { score: number; coins: number; hp: number; checkpoint: string; items: { icon: string; name: string }[] }) {
    this.pauseStage.textContent = stage;
    this.pauseStats.replaceChildren(
      stat('icon icon-star', '', stats.score, '점'), stat('coin-icon', '', stats.coins, '개'), stat('icon icon-heart', 'HP ', stats.hp, ''),
      stat('icon icon-flag', '', stats.checkpoint, ''),
    );
    if (stats.items.length) {
      const chip = document.createElement('span');
      chip.className = 'result-stat pause-items';
      chip.setAttribute('aria-label', stats.items.map((item) => item.name).join(', '));
      chip.append(...stats.items.map((item) => { const mark = document.createElement('i'); mark.className = `icon icon-${item.icon}`; return mark; }));
      this.pauseStats.append(chip);
    }
    this.togglePauseSettings(false);
    this.tipsResetButton.disabled = false;
    openModal(this.pause);
    this.resumeButton.focus({ preventScroll: true });
  }

  hidePause() { closeModal(this.pause); }

  // Settings replace the stats so the card keeps its height on a phone held sideways.
  private togglePauseSettings(open: boolean) {
    this.pausePanel.hidden = !open;
    this.pauseCard.classList.toggle('settings', open);
    this.pauseSettings.setAttribute('aria-expanded', String(open));
  }

  hideResult() {
    for (const overlay of [this.pause, this.unlock, this.result, this.revive]) dropModal(overlay);
    this.nextButton.hidden = true;
  }
}
