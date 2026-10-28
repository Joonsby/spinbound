import Phaser from 'phaser';
import { getPlayerProgress, savePlayerProgress } from './progress';

export type SoundCue = 'jump' | 'land' | 'dash' | 'coin' | 'enemy' | 'hurt';
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
    const sounds: Record<SoundCue, [number, number, number, OscillatorType, number]> = {
      jump: [280, 0.14, 0.055, 'sine', 700], land: [130, 0.09, 0.045, 'triangle', 55],
      dash: [180, 0.18, 0.035, 'sawtooth', 650], coin: [900, 0.14, 0.045, 'sine', 1500],
      enemy: [420, 0.2, 0.055, 'triangle', 70], hurt: [190, 0.23, 0.045, 'square', 45],
    };
    const [frequency, duration, volume, type, end] = sounds[cue];
    this.tone(frequency, duration, volume, type, now, end);
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

export class GameEffects {
  private particles: { image: Phaser.GameObjects.Image; vx: number; vy: number; age: number; life: number; size: number }[];
  private ghosts: { image: Phaser.GameObjects.Image; age: number }[];
  private nextTrail = 0;

  constructor(scene: Phaser.Scene) {
    if (!scene.textures.exists('fx-spark')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xffffff); g.fillTriangle(4, 0, 2, 4, 6, 4); g.fillTriangle(4, 8, 2, 4, 6, 4); g.fillTriangle(0, 4, 4, 2, 4, 6); g.fillTriangle(8, 4, 4, 2, 4, 6);
      g.generateTexture('fx-spark', 8, 8); g.destroy();
    }
    this.particles = Array.from({ length: 48 }, () => ({ image: scene.add.image(0, 0, 'fx-spark').setDepth(6).setVisible(false), vx: 0, vy: 0, age: 0, life: 0, size: 1 }));
    this.ghosts = Array.from({ length: 6 }, () => ({ image: scene.add.image(0, 0, 'robot-idle-0').setDepth(3).setVisible(false), age: 0 }));
  }

  burst(x: number, y: number, color: number, count: number, speed = 100) {
    let emitted = 0;
    for (const particle of this.particles) {
      if (particle.image.visible) continue;
      const angle = emitted / count * Math.PI * 2;
      particle.vx = Math.cos(angle) * speed;
      particle.vy = Math.sin(angle) * speed - 45;
      particle.age = 0; particle.life = 0.3 + emitted % 3 * 0.07; particle.size = 0.6 + emitted % 3 * 0.3;
      particle.image.setPosition(x, y).setTint(color).setAlpha(1).setScale(particle.size).setVisible(true);
      if (++emitted >= Math.min(count, 12)) break;
    }
  }

  trail(player: Phaser.GameObjects.Sprite, time: number) {
    if (time < this.nextTrail) return;
    this.nextTrail = time + 75;
    const ghost = this.ghosts.find((entry) => !entry.image.visible);
    if (ghost) {
      ghost.age = 0;
      ghost.image.setTexture(player.texture.key, player.frame.name).setPosition(player.x, player.y).setScale(player.scaleX, player.scaleY).setFlipX(player.flipX).setTint(0x9bffe6).setAlpha(0.3).setVisible(true);
    }
    this.burst(player.x - (player.flipX ? -18 : 18), player.y + 12, 0xcaffef, 2, 65);
  }

  update(delta: number) {
    const dt = Math.min(delta, 50) / 1000;
    for (const particle of this.particles) {
      if (!particle.image.visible) continue;
      particle.age += dt;
      if (particle.age >= particle.life) { particle.image.setVisible(false); continue; }
      particle.vy += 180 * dt;
      particle.image.x += particle.vx * dt; particle.image.y += particle.vy * dt;
      const remaining = 1 - particle.age / particle.life;
      particle.image.setAlpha(remaining).setScale(particle.size * remaining);
    }
    for (const ghost of this.ghosts) {
      if (!ghost.image.visible) continue;
      ghost.age += dt;
      if (ghost.age >= 0.24) ghost.image.setVisible(false);
      else ghost.image.setAlpha(0.3 * (1 - ghost.age / 0.24));
    }
  }

  clear() {
    this.particles.forEach((particle) => particle.image.setVisible(false));
    this.ghosts.forEach((ghost) => ghost.image.setVisible(false));
  }

  destroy() {
    this.particles.forEach((particle) => particle.image.destroy());
    this.ghosts.forEach((ghost) => ghost.image.destroy());
  }
}
