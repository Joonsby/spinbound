import Phaser from 'phaser';

export type PlayerPose = 'idle' | 'run' | 'jump' | 'fall' | 'dash' | 'hurt';
export const THEMES = [
  { sky: 0xbce9f5, far: 0x97c9ad, near: 0x5aab83, soil: 0x8e6750, top: 0x92d968, accent: '#d5f798' },
  { sky: 0x91bec5, far: 0x587d88, near: 0x315f59, soil: 0x514f48, top: 0x70b897, accent: '#a5e5c6' },
  { sky: 0x241f3c, far: 0x39314d, near: 0x53405a, soil: 0x45384b, top: 0xf18b67, accent: '#ffbe89' },
];

// Game-wide textures and animations are generated once and reused after scene restarts.
export function createTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('moss-idle-0')) return;
  const g = scene.make.graphics({ x: 0, y: 0 });
  const save = (key: string, width: number, height: number, draw: () => void) => {
    g.clear(); draw(); g.generateTexture(key, width, height);
  };
  const counts: Record<PlayerPose, number> = { idle: 4, run: 6, jump: 2, fall: 2, dash: 4, hurt: 2 };
  for (const pose of Object.keys(counts) as PlayerPose[]) {
    const count = counts[pose];
    for (let frame = 0; frame < count; frame++) {
      save(`moss-${pose}-${frame}`, 48, 64, () => {
        const phase = frame / count * Math.PI * 2;
        const bob = pose === 'idle' ? Math.sin(phase) * 1.5 : pose === 'run' ? Math.abs(Math.sin(phase)) * -3 : 0;
        const lean = pose === 'dash' ? 4 : 0;
        const stride = pose === 'run' || pose === 'dash' ? Math.sin(phase) * 5 : pose === 'fall' ? 4 : 0;
        if (pose === 'dash') {
          g.lineStyle(2, 0xe1fff4, 0.8);
          for (let i = 0; i < 3; i++) g.lineBetween(1, 31 + i * 7, 10 + frame * 2, 31 + i * 7);
        }
        g.fillStyle(0x34665e); g.fillEllipse(23, 59, 28, 5);
        g.fillStyle(0xda8a54); g.fillRoundedRect(12 + stride, 51, 12, 8, 4); g.fillRoundedRect(26 - stride, 51, 12, 8, 4);
        g.fillStyle(0x4b9a7f); g.fillTriangle(12, 28 + bob, 4, 48 + bob, 25, 45 + bob);
        g.fillStyle(pose === 'hurt' ? 0xffcab9 : 0xffedc7);
        g.fillRoundedRect(10 + lean, 20 + bob, 30, 34, 14);
        g.fillStyle(0xfff9e7); g.fillEllipse(27 + lean, 43 + bob, 19, 16);
        g.fillStyle(0x69b38b); g.fillEllipse(20 + lean, 16 + bob, 15, 9); g.fillEllipse(32 + lean, 13 + bob, 16, 9);
        g.lineStyle(3, 0x386a53); g.lineBetween(26 + lean, 22 + bob, 27 + lean, 13 + bob);
        g.fillStyle(0xe78d7f); g.fillEllipse(15 + lean, 37 + bob, 7, 4); g.fillEllipse(36 + lean, 37 + bob, 6, 4);
        g.lineStyle(2, 0x354d4b);
        if (pose === 'hurt') {
          g.lineBetween(19 + lean, 30 + bob, 23 + lean, 34 + bob); g.lineBetween(23 + lean, 30 + bob, 19 + lean, 34 + bob);
          g.lineBetween(30 + lean, 30 + bob, 34 + lean, 34 + bob); g.lineBetween(34 + lean, 30 + bob, 30 + lean, 34 + bob);
        } else if (pose === 'idle' && frame === 3) {
          g.lineBetween(19, 32 + bob, 23, 32 + bob); g.lineBetween(30, 32 + bob, 34, 32 + bob);
        } else {
          g.fillStyle(0x354d4b); g.fillEllipse(22 + lean, 32 + bob, 4, pose === 'fall' ? 7 : 6); g.fillEllipse(33 + lean, 32 + bob, 4, 6);
        }
        g.lineBetween(25 + lean, 39 + bob, 29 + lean, pose === 'jump' ? 41 + bob : 39 + bob);
        g.fillStyle(0xf7b768); g.fillRoundedRect(9 + lean, 41 + bob, 9, 6, 3);
        if (pose === 'jump') { g.fillStyle(0xffedc7); g.fillCircle(40, 25, 4); }
      });
    }
    scene.anims.create({ key: `moss-${pose}`, frames: Array.from({ length: count }, (_, i) => ({ key: `moss-${pose}-${i}` })), frameRate: pose === 'idle' ? 4 : pose === 'dash' ? 18 : 10, repeat: -1 });
  }
  for (let frame = 0; frame < 6; frame++) {
    save(`coin-${frame}`, 28, 28, () => {
      const width = 5 + Math.abs(Math.cos(frame / 6 * Math.PI)) * 18;
      g.fillStyle(0xad702e); g.fillEllipse(14, 15, width, 24);
      g.fillStyle(0xffce60); g.fillEllipse(14, 13, width, 23);
      g.lineStyle(2, 0xfff0b6); g.strokeEllipse(14, 13, Math.max(3, width - 6), 17);
      g.fillStyle(0xfff6cc); g.fillRect(12, 8, 3, 9);
    });
  }
  scene.anims.create({ key: 'coin-spin', frames: Array.from({ length: 6 }, (_, i) => ({ key: `coin-${i}` })), frameRate: 9, repeat: -1 });
  for (let frame = 0; frame < 4; frame++) {
    save(`enemy-${frame}`, 44, 42, () => {
      const bob = frame % 2 * 2;
      g.fillStyle(0x634e76); g.fillEllipse(22, 39, 34, 5);
      g.fillStyle(0x9674b0); g.fillRoundedRect(4, 12 + bob, 36, 26 - bob, 12);
      g.fillStyle(0xc5a5cf); g.fillEllipse(22, 15 + bob, 36, 20);
      g.fillStyle(0xf9deab); g.fillCircle(14, 14 + bob, 4); g.fillCircle(28, 10 + bob, 3);
      g.fillStyle(0x352d43); g.fillCircle(15, 27 + bob, 2); g.fillCircle(28, 27 + bob, 2);
      g.fillStyle(0xe4aec3); g.fillEllipse(10, 31 + bob, 6, 3); g.fillEllipse(33, 31 + bob, 6, 3);
      g.fillStyle(0x745386); g.fillRoundedRect(7 + frame % 2 * 3, 35, 10, 5, 2); g.fillRoundedRect(26 - frame % 2 * 3, 35, 10, 5, 2);
    });
  }
  scene.anims.create({ key: 'enemy-walk', frames: Array.from({ length: 4 }, (_, i) => ({ key: `enemy-${i}` })), frameRate: 7, repeat: -1 });
  save('spike-art', 36, 30, () => {
    g.fillStyle(0x804b61); g.fillRoundedRect(0, 25, 36, 5, 2);
    g.fillStyle(0xe38b9f); g.fillTriangle(2, 27, 18, 1, 34, 27);
    g.fillStyle(0xffd5da); g.fillTriangle(5, 24, 18, 3, 18, 24);
    g.lineStyle(2, 0xa75070); g.lineBetween(20, 10, 28, 25);
  });
  for (const kind of ['spring', 'boost']) save(`${kind}-art`, 66, 16, () => {
    g.fillStyle(0x334c59); g.fillRoundedRect(0, 0, 66, 16, 4);
    g.fillStyle(kind === 'spring' ? 0xffb565 : 0x6ce2de); g.fillRoundedRect(2, 0, 62, 5, 2);
    g.lineStyle(2, kind === 'spring' ? 0xffd9a3 : 0xb9fff2);
    for (let x = 9; x < 60; x += 14) {
      if (kind === 'spring') { g.lineBetween(x, 6, x + 7, 9); g.lineBetween(x + 7, 9, x, 13); }
      else { g.lineBetween(x, 7, x + 5, 10); g.lineBetween(x + 5, 10, x, 13); }
    }
  });
  save('moving-art', 110, 20, () => {
    g.fillStyle(0x655e91); g.fillRoundedRect(0, 0, 110, 20, 6);
    g.fillStyle(0xc1b5f2); g.fillRoundedRect(0, 0, 110, 6, 3);
    g.fillStyle(0x90e8d9); for (let x = 12; x < 110; x += 21) g.fillCircle(x, 13, 2);
  });
  THEMES.forEach((theme, index) => save(`terrain-${index}`, 64, 64, () => {
    g.fillStyle(theme.soil); g.fillRect(0, 0, 64, 64);
    g.lineStyle(1, 0x182f38, 0.18); g.strokeRoundedRect(3, 5, 27, 17, 4); g.strokeRoundedRect(35, 29, 26, 20, 4);
    g.fillStyle(0xffe4b0, 0.15); g.fillEllipse(14, 37, 8, 4); g.fillEllipse(49, 13, 10, 4); g.fillEllipse(20, 59, 6, 3);
  }));
  g.destroy();
}

export function createBackground(scene: Phaser.Scene, index: number, worldWidth: number) {
  const theme = THEMES[index];
  scene.cameras.main.setBackgroundColor(theme.sky);
  const horizon = scene.add.graphics().setDepth(-30).setScrollFactor(0);
  horizon.fillStyle(index === 2 ? 0xa55358 : 0xf9f2cd, 0.65);
  horizon.fillCircle(120, 155, index === 2 ? 48 : 34);
  for (let layer = 0; layer < 2; layer++) {
    const g = scene.add.graphics().setDepth(-20 + layer).setScrollFactor(layer === 0 ? 0.18 : 0.43, 1);
    const color = layer === 0 ? theme.far : theme.near;
    g.fillStyle(color);
    for (let x = -400; x < worldWidth + 2400; x += layer === 0 ? 260 : 160) {
      const y = 350 + Math.sin(x * 0.014) * 45 + layer * 70;
      if (index === 0) {
        g.fillEllipse(x + 100, y + 100, layer === 0 ? 480 : 330, 240); g.fillRect(x, y + 100, 270, 350);
      } else if (index === 1) {
        g.fillTriangle(x - 90, 600, x + 90, y - (layer === 0 ? 170 : 80), x + 270, 600);
        if (layer === 1) { g.fillRect(x + 84, y + 30, 12, 200); g.fillTriangle(x + 20, y + 65, x + 90, y - 55, x + 160, y + 65); }
      } else {
        g.fillTriangle(x - 70, 0, x + 65, 160 + Math.sin(x) * 70, x + 160, 0);
        g.fillTriangle(x - 60, 600, x + 65, y - 70, x + 200, 600);
      }
    }
  }
  const detail = scene.add.graphics().setDepth(-5).setScrollFactor(0.65, 1);
  if (index === 0) {
    detail.fillStyle(0xffffff, 0.7);
    for (let x = 80; x < worldWidth + 2400; x += 310) { detail.fillEllipse(x, 180 + Math.sin(x) * 30, 100, 22); detail.fillEllipse(x - 16, 166 + Math.sin(x) * 30, 52, 30); }
  } else if (index === 1) {
    detail.fillStyle(0xe0f7b1, 0.65);
    for (let x = 50; x < worldWidth + 2400; x += 90) detail.fillCircle(x, 220 + Math.sin(x) * 140, 2);
  } else {
    detail.fillStyle(0xe2684d); detail.fillRect(-400, 565, worldWidth + 3200, 60);
    detail.fillStyle(0xffbd70); for (let x = -400; x < worldWidth + 2400; x += 80) detail.fillEllipse(x, 568, 110, 12);
    detail.fillStyle(0xffce80, 0.7); for (let x = 0; x < worldWidth + 2400; x += 130) detail.fillCircle(x, 260 + Math.sin(x) * 210, 2);
  }
}
