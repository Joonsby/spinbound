import { getPlayerProgress, savePlayerProgress } from './progress';

export type SoundCue = 'jump' | 'land' | 'roll' | 'coin' | 'enemy' | 'hurt' | 'spring' | 'boost' | 'stomp' | 'break' | 'clang' | 'grab' | 'boss-hit';
type Tone = [frequency: number, duration: number, volume: number, type: OscillatorType, endFrequency: number, delay?: number];

const SOUNDS: Record<SoundCue, Tone[]> = {
  jump: [[280, 0.14, 0.055, 'sine', 700]],
  land: [[130, 0.09, 0.045, 'triangle', 55]],
  roll: [[180, 0.18, 0.035, 'sawtooth', 650], [520, 0.08, 0.025, 'square', 900, 0.05]],
  coin: [[900, 0.14, 0.045, 'sine', 1500]],
  enemy: [[420, 0.2, 0.055, 'triangle', 70]],
  hurt: [[190, 0.23, 0.045, 'square', 45]],
  spring: [[240, 0.12, 0.05, 'sine', 520], [520, 0.16, 0.045, 'sine', 1100, 0.06]],
  boost: [[220, 0.22, 0.04, 'sawtooth', 880]],
  stomp: [[620, 0.1, 0.05, 'square', 180], [900, 0.08, 0.03, 'sine', 1300, 0.04]],
  break: [[150, 0.24, 0.06, 'square', 40], [90, 0.3, 0.05, 'sawtooth', 30, 0.03]],
  clang: [[1200, 0.12, 0.035, 'square', 900], [1700, 0.1, 0.025, 'triangle', 1500, 0.02]],
  grab: [[340, 0.08, 0.04, 'triangle', 420]],
  'boss-hit': [[260, 0.26, 0.06, 'square', 60], [700, 0.12, 0.04, 'sine', 300, 0.03]],
};
let soundEnabled = getPlayerProgress().soundEnabled;
export function getSoundEnabled() { return soundEnabled; }
export function setSoundEnabled(enabled: boolean) {
  soundEnabled = enabled;
  const progress = getPlayerProgress(); progress.soundEnabled = enabled; savePlayerProgress(progress);
}
let sharedContext: AudioContext | undefined;

export function closeAudio() {
  if (sharedContext) void sharedContext.close().catch(() => {});
  sharedContext = undefined;
}

// Each scene owns its audio nodes, scheduler and input listeners.
export class GameAudio {
  private context?: AudioContext;
  private voices = new Set<OscillatorNode>();
  private cooldowns = new Map<SoundCue, number>();
  private timer?: number;
  private nextBeat = 0;
  private beat = 0;
  private musicActive = true;
  private disposed = false;
  private backgroundPaused = document.hidden;
  private button: HTMLButtonElement;

  constructor(private stage: number) {
    this.context = sharedContext;
    this.button = document.querySelector<HTMLButtonElement>('#sound-toggle')!;
    this.button.onclick = () => {
      setSoundEnabled(!soundEnabled);
      this.refreshButton();
      if (soundEnabled) this.unlock();
      else this.silence();
    };
    this.refreshButton();
    document.addEventListener('pointerdown', this.onGesture, true);
    document.addEventListener('keydown', this.onGesture, true);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('blur', this.onBlur);
    this.startMusic();
  }

  private refreshButton() {
    this.button.textContent = `♪ ${soundEnabled ? 'ON' : 'OFF'}`;
    this.button.setAttribute('aria-pressed', String(soundEnabled));
    this.button.setAttribute('aria-label', `사운드 ${soundEnabled ? '끄기' : '켜기'}`);
  }

  private onGesture = (event: Event) => {
    if (event.isTrusted && event.target !== this.button) this.unlock();
  };
  private onVisibility = () => { if (document.hidden) this.pauseForBackground(); else this.resumeFromBackground(); };
  private onBlur = () => this.pauseForBackground();

  pauseForBackground() {
    this.backgroundPaused = true;
    this.silence();
    if (this.context?.state === 'running') void this.context.suspend().catch(() => {});
  }

  resumeFromBackground() {
    if (this.disposed || document.hidden) return;
    this.backgroundPaused = false;
    // Only resume a context already unlocked by a user gesture.
    if (soundEnabled && this.context && this.context.state !== 'closed') {
      void this.context.resume().then(() => this.startMusic()).catch(() => {});
    }
  }

  private unlock() {
    if (this.disposed || this.backgroundPaused || !soundEnabled || document.hidden) return;
    try {
      const AudioConstructor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioConstructor) return;
      if (!this.context || this.context.state === 'closed') this.context = sharedContext = new AudioConstructor();
      if (this.context.state !== 'running') {
        void this.context.resume().then(() => this.startMusic()).catch(() => {});
      } else this.startMusic();
    } catch { /* Audio support is optional; gameplay remains available. */ }
  }

  private tone(frequency: number, duration: number, volume: number, type: OscillatorType, when: number, endFrequency = frequency) {
    const context = this.context;
    if (!context || this.backgroundPaused || context.state !== 'running' || !soundEnabled || this.voices.size >= 16) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, when);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), when + duration);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(volume, when + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    oscillator.connect(gain); gain.connect(context.destination);
    this.voices.add(oscillator);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.voices.delete(oscillator); };
    oscillator.start(when); oscillator.stop(when + duration + 0.01);
  }

  play(cue: SoundCue) {
    if (this.disposed || this.backgroundPaused || !soundEnabled || this.context?.state !== 'running') return;
    const now = this.context.currentTime;
    if (now - (this.cooldowns.get(cue) ?? -10) < (cue === 'coin' ? 0.055 : 0.12)) return;
    this.cooldowns.set(cue, now);
    for (const [frequency, duration, volume, type, end, delay = 0] of SOUNDS[cue]) this.tone(frequency, duration, volume, type, now + delay, end);
  }

  private startMusic() {
    if (this.disposed || this.backgroundPaused || !soundEnabled || !this.musicActive || this.timer !== undefined || this.context?.state !== 'running') return;
    this.nextBeat = this.context.currentTime + 0.04;
    const melodies = [
      [72, 76, 79, 76, 74, 79, 81, 79, 76, 72, 74, 76, 79, 74, 71, 74],
      [64, 67, 71, 74, 71, 67, 66, 69, 62, 66, 69, 72, 69, 66, 67, 71],
      [57, 64, 60, 67, 57, 65, 60, 64, 55, 62, 59, 65, 56, 63, 60, 68],
    ];
    const schedule = () => {
      if (!this.context || this.context.state !== 'running') return;
      const interval = [0.26, 0.3, 0.22][this.stage];
      if (this.nextBeat < this.context.currentTime) this.nextBeat = this.context.currentTime + 0.02;
      while (this.nextBeat < this.context.currentTime + 0.25) {
        const note = melodies[this.stage][this.beat % 16];
        const frequency = 440 * 2 ** ((note - 69) / 12);
        this.tone(frequency, interval * 0.7, 0.018, 'sine', this.nextBeat);
        if (this.beat % 4 === 0) this.tone(frequency / 4, interval * 2.5, 0.022, 'triangle', this.nextBeat);
        this.beat++; this.nextBeat += interval;
      }
    };
    schedule();
    this.timer = window.setInterval(schedule, 100);
  }

  private silence() {
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
    this.voices.forEach((voice) => { try { voice.stop(); } catch { /* Already stopped. */ } });
  }

  stopMusic() { this.musicActive = false; this.silence(); }

  destroy() {
    this.disposed = true;
    this.silence();
    document.removeEventListener('pointerdown', this.onGesture, true);
    document.removeEventListener('keydown', this.onGesture, true);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('blur', this.onBlur);
    this.button.onclick = null;
  }
}
