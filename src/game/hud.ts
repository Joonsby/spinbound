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
  private stage = element('#stage-label');
  private speedHud = element('#speed-hud');
  private result = element('#result');
  private resultTitle = element('#result-title');
  private resultStats = element('#result-stats');
  readonly nextButton = element<HTMLButtonElement>('#result-next');
  readonly restartButton = element<HTMLButtonElement>('#result-restart');
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

  hideResult() {
    this.result.hidden = true;
    this.nextButton.hidden = true;
  }
}
