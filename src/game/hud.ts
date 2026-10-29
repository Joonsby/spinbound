import { PHYSICS } from './config';

const SPEED_STEPS = 24;
// Above this many hit points the HUD shows numbers instead of hearts.
const MAX_HEARTS = 6;

const element = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

function stat(iconClass: string, label: string, value: number, unit: string) {
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
  private hpChip = element('.chip-hp');
  private coinChip = element('.chip-coin');
  private stage = element('#stage-label');
  private speedHud = element('#speed-hud');
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
  private revive = element('#revive');
  private reviveInfo = element('#revive-info');
  private tip = element('#tip');
  private tipStep = element('#tip-step');
  private tipTitle = element('#tip-title');
  private tipText = element('#tip-text');
  readonly tipButton = element<HTMLButtonElement>('#tip-continue');
  private shownSpeed = -1;
  private shownRolling: boolean | undefined;
  private shownStatus = '';
  private shownHp = '';

  constructor() {
    this.speedHud.style.setProperty('--roll-mark', String(PHYSICS.rollEnterSpeed / PHYSICS.boostSpeed));
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
    this.hp.setAttribute('aria-label', `HP ${text}`);
    if (maxHp > MAX_HEARTS) { this.hp.textContent = text; return; }
    this.hp.replaceChildren(...Array.from({ length: maxHp }, (_, index) => {
      const heart = document.createElement('i');
      heart.className = index < hp ? 'heart' : 'heart lost';
      return heart;
    }));
  }

  // Active pre-stage items show as marks on the HP and coin chips.
  setBoosts(shield: boolean, magnet: boolean) {
    this.hpChip.classList.toggle('shielded', shield);
    this.coinChip.classList.toggle('magnet', magnet);
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
    this.result.hidden = false;
    (showNext ? this.nextButton : this.restartButton).focus({ preventScroll: true });
  }

  // Clear reward under the stats; null hides it (game over). The ad button shows until the reward is doubled.
  setReward(amount: number | null, doubled = false) {
    this.reward.hidden = amount === null;
    this.doubleButton.hidden = amount === null || doubled;
    this.doubleButton.disabled = false;
    if (amount !== null) this.reward.replaceChildren(stat('coin-icon', doubled ? '보상 2배 ' : '보상 ', doubled ? amount * 2 : amount, '코인'));
  }

  showRevive(cost: number, balance: number) {
    this.reviveCoinButton.textContent = `코인 ${cost}개로 부활`;
    this.reviveCoinButton.disabled = balance < cost;
    const note = document.createElement('span');
    note.textContent = '마지막 체크포인트에서 HP를 가득 채워 이어 해요';
    this.reviveInfo.replaceChildren(note, stat('coin-icon', '보유 ', balance, '개'));
    this.revive.hidden = false;
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
    this.tip.hidden = false;
    this.tipButton.focus({ preventScroll: true });
  }

  hideTip() { this.tip.hidden = true; }

  hideResult() {
    this.result.hidden = true;
    this.revive.hidden = true;
    this.nextButton.hidden = true;
  }
}
