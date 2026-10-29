import { PHYSICS } from './config';

const SPEED_STEPS = 24;

const element = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

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

  setHp(hp: number, maxHp: number) { this.hp.textContent = `${hp} / ${maxHp}`; }

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

  showResult(title: string, stats: string, showNext: boolean, restartLabel: string) {
    this.resultTitle.textContent = title;
    this.resultStats.textContent = stats;
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
