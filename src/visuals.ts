import Phaser from 'phaser';
import { animationKey, frameKey, PLAYER_POSES, ROBOT_CLIPS } from './game/player-animation';

export const THEMES = [
  { sky: 0xbce9f5, far: 0x97c9ad, near: 0x5aab83, soil: 0x8e6750, top: 0x92d968, accent: '#d5f798' },
  { sky: 0x91bec5, far: 0x587d88, near: 0x315f59, soil: 0x514f48, top: 0x70b897, accent: '#a5e5c6' },
  { sky: 0x241f3c, far: 0x39314d, near: 0x53405a, soil: 0x45384b, top: 0xf18b67, accent: '#ffbe89' },
];

// Game-wide textures and animations are generated once and reused after scene restarts.
export function createTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('robot-idle-0')) return;
  const g = scene.make.graphics({ x: 0, y: 0 });
  const save = (key: string, width: number, height: number, draw: () => void) => {
    g.clear(); draw(); g.generateTexture(key, width, height);
  };
  for (const pose of PLAYER_POSES) {
    const count = ROBOT_CLIPS[pose].frames;
    for (let frame = 0; frame < count; frame++) {
      save(frameKey('robot', pose, frame), 48, 64, () => {
        const phase = frame / count * Math.PI * 2;
        const bob = pose === 'idle' ? Math.sin(phase) : pose === 'run' ? Math.sin(phase) * 0.4 : 0;
        const orange = pose === 'hurt' ? 0xf17b62 : pose === 'dead' ? 0xa58f7c : 0xf9a044;
        if (pose === 'roll') {
          // Retracted wheels and interlocking shell panels form a rolling sphere.
          g.fillStyle(0x46525b); g.fillCircle(24, 39, 21);
          g.fillStyle(0xf2f2e9); g.fillCircle(24, 39, 19);
          g.lineStyle(7, orange);
          for (let panel = 0; panel < 3; panel++) {
            const angle = phase + panel * Math.PI * 2 / 3;
            g.beginPath(); g.arc(24, 39, 15, angle, angle + 1.25); g.strokePath();
            g.fillStyle(0x66747e); g.fillCircle(24 + Math.cos(angle) * 11, 39 + Math.sin(angle) * 11, 2);
          }
          g.fillStyle(0x34434c); g.fillCircle(24, 39, 8);
          g.fillStyle(0xa4f2ed);
          for (const dx of [-3, 3]) g.fillCircle(24 + dx * Math.cos(phase), 39 + dx * Math.sin(phase), 2);
          g.fillStyle(0xffffff, 0.7); g.fillCircle(17, 29, 3);
          return;
        }
        const lift = pose === 'jump' ? -3 - frame : pose === 'fall' ? 2 + frame : 0;
        // Two independent little wheel pods; wheel phase is advanced by run frames.
        for (const x of [13, 35]) {
          const y = 54 + lift;
          g.fillStyle(0x77828b); g.fillRoundedRect(x - 3, 44, 6, 12 + lift, 2);
          g.fillStyle(0x35414b); g.fillCircle(x, y, 8);
          g.fillStyle(0x87929a); g.fillCircle(x, y, 5.5);
          const rotation = pose === 'run' ? phase : pose === 'jump' || pose === 'fall' ? phase * 0.2 : 0;
          g.lineStyle(1.5, 0xd9e1e2);
          for (let spoke = 0; spoke < 3; spoke++) {
            const angle = rotation + spoke * Math.PI * 2 / 3;
            g.lineBetween(x, y, x + Math.cos(angle) * 5, y + Math.sin(angle) * 5);
          }
          g.fillStyle(orange); g.fillCircle(x, y, 2.5);
          g.fillStyle(0xfff5d8); g.fillCircle(x + Math.cos(rotation) * 5, y + Math.sin(rotation) * 5, 1.3);
        }
        // Compact round chassis, asymmetrical orange shoulder and service hatch.
        g.fillStyle(0x55636c); g.fillRoundedRect(4, 16 + bob, 40, 34, 15);
        g.fillStyle(0xf2f2e9); g.fillRoundedRect(6, 16 + bob, 36, 31, 14);
        g.fillStyle(orange); g.fillRoundedRect(6, 18 + bob, 10, 27, 7);
        g.fillStyle(0xffffff, 0.75); g.fillEllipse(27, 19 + bob, 15, 4);
        g.fillStyle(0x71818a); g.fillRoundedRect(22, 42 + bob, 13, 5, 2);
        g.fillStyle(orange); g.fillCircle(37, 41 + bob, 2);
        g.fillStyle(0x35434d); g.fillRoundedRect(14, 24 + bob, 25, 14, 6);
        g.fillStyle(pose === 'hurt' ? 0xff9a84 : 0xa4f2ed);
        if (pose === 'hurt' || pose === 'dead') {
          g.lineStyle(2, pose === 'dead' ? 0x8a99a3 : 0xff9a84);
          for (const x of [21, 32]) { g.lineBetween(x - 2, 28 + bob, x + 2, 33 + bob); g.lineBetween(x + 2, 28 + bob, x - 2, 33 + bob); }
        } else if (pose === 'idle' && frame === 3) {
          g.fillRoundedRect(18, 30 + bob, 6, 2, 1); g.fillRoundedRect(29, 30 + bob, 6, 2, 1);
        } else {
          const eyeHeight = pose === 'fall' ? 8 : pose === 'jump' ? 7 : 5;
          g.fillRoundedRect(19, 27 + bob, 4, eyeHeight, 2); g.fillRoundedRect(30, 27 + bob, 4, eyeHeight, 2);
        }
        g.lineStyle(2, 0x71818a); g.lineBetween(25, 16 + bob, 25, 10 + bob);
        g.fillStyle(orange); g.fillCircle(25, 9 + bob, 3);
        g.fillStyle(0xffedb7); g.fillCircle(25, 8 + bob, 1);
        // Small side grippers lift for take-off and open during descent.
        const armY = pose === 'jump' ? 24 : pose === 'fall' ? 38 : 34;
        g.fillStyle(0x87929a); g.fillRoundedRect(1, armY + bob, 6, 10, 3); g.fillRoundedRect(41, armY + bob, 6, 10, 3);
        if (pose === 'dead') { g.fillStyle(0xd7dde0, 0.7 - frame * 0.3); g.fillCircle(30 + frame * 4, 6 - frame * 3, 4 + frame * 2); }
      });
    }
    const { frameRate, repeat } = ROBOT_CLIPS[pose];
    scene.anims.create({ key: animationKey('robot', pose), frames: Array.from({ length: count }, (_, i) => ({ key: frameKey('robot', pose, i) })), frameRate, repeat });
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
  for (const kind of ['fly', 'charge']) {
    for (let frame = 0; frame < 4; frame++) {
      save(`enemy-${kind}-${frame}`, kind === 'fly' ? 56 : 44, 42, () => {
        const cx = kind === 'fly' ? 28 : 22;
        if (kind === 'fly') {
          g.fillStyle(0xd4f5e9); g.fillEllipse(9, 12 + frame % 2 * 5, 18, 7); g.fillEllipse(47, 12 + frame % 2 * 5, 18, 7);
          g.fillStyle(0x4f938c); g.fillRoundedRect(12, 10, 32, 28, 12);
          g.fillStyle(0x93dac4); g.fillEllipse(28, 15, 31, 16);
          g.lineStyle(2, 0xe1fff1); g.lineBetween(24, 7, 32, 7);
        } else {
          g.fillStyle(0x675469); g.fillRoundedRect(3, 31, 38, 9, 4);
          g.fillStyle(0xb57762); g.fillRoundedRect(4, 8, 36, 28, 10);
          g.fillStyle(0xf3bd75); g.fillRoundedRect(6, 8, 32, 7, 3);
          g.fillStyle(0x55495f); g.fillTriangle(5, 7, 8, 18, 14, 12); g.fillTriangle(39, 7, 36, 18, 30, 12);
        }
        g.fillStyle(0x263d48); g.fillRoundedRect(cx - 11, 20, 22, 12, 5);
        g.fillStyle(kind === 'fly' ? 0xddfff2 : 0xffe1a4); g.fillCircle(cx - 5, 25, 2); g.fillCircle(cx + 5, 25, 2);
      });
    }
    scene.anims.create({ key: `enemy-${kind}`, frames: Array.from({ length: 4 }, (_, i) => ({ key: `enemy-${kind}-${i}` })), frameRate: kind === 'fly' ? 12 : 6, repeat: -1 });
  }
  save('reward-star', 38, 38, () => {
    g.fillStyle(0xffd578); g.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = i * Math.PI / 5 - Math.PI / 2;
      const radius = i % 2 === 0 ? 18 : 9;
      const x = 19 + Math.cos(angle) * radius; const y = 19 + Math.sin(angle) * radius;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath(); g.fillPath();
    g.fillStyle(0xfff7cb); g.fillCircle(16, 13, 4);
  });
  save('spike-art', 36, 30, () => {
    g.fillStyle(0x804b61); g.fillRoundedRect(0, 25, 36, 5, 2);
    g.fillStyle(0xe38b9f); g.fillTriangle(2, 27, 18, 1, 34, 27);
    g.fillStyle(0xffd5da); g.fillTriangle(5, 24, 18, 3, 18, 24);
    g.lineStyle(2, 0xa75070); g.lineBetween(20, 10, 28, 25);
  });
  save('spring-art', 66, 16, () => {
    g.fillStyle(0x334c59); g.fillRoundedRect(4, 12, 58, 4, 2);
    g.lineStyle(3, 0xc7d3da);
    for (let x = 12; x < 56; x += 10) { g.lineBetween(x, 12, x + 5, 5); g.lineBetween(x + 5, 5, x + 10, 12); }
    g.fillStyle(0xffb565); g.fillRoundedRect(0, 0, 66, 6, 3);
    g.fillStyle(0xffe2b8); g.fillRoundedRect(4, 1, 58, 2, 1);
  });
  save('boost-art', 66, 16, () => {
    g.fillStyle(0x334c59); g.fillRoundedRect(0, 0, 66, 16, 4);
    g.fillStyle(0x6ce2de); g.fillRoundedRect(2, 0, 62, 4, 2);
    g.fillStyle(0xb9fff2);
    for (let x = 8; x < 60; x += 15) g.fillTriangle(x, 6, x + 9, 10, x, 14);
  });
  save('wall-art', 36, 80, () => {
    g.fillStyle(0x6f5843); g.fillRect(0, 0, 36, 80);
    g.fillStyle(0xb79572);
    for (let row = 0; row < 5; row++) for (let col = -1; col < 2; col++) g.fillRoundedRect(col * 18 + (row % 2) * 9 + 2, row * 16 + 2, 15, 13, 3);
    g.lineStyle(2, 0x3e2f24); g.lineBetween(8, 10, 18, 30); g.lineBetween(18, 30, 12, 46); g.lineBetween(18, 30, 30, 38); g.lineBetween(24, 52, 14, 70);
    g.fillStyle(0xffe1a8, 0.8); g.fillTriangle(14, 34, 22, 40, 14, 46);
  });
  save('rope-anchor', 24, 24, () => {
    g.fillStyle(0x4b5560); g.fillRoundedRect(2, 2, 20, 10, 4);
    g.lineStyle(3, 0xc7d3da); g.strokeCircle(12, 15, 6);
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
  const chunks: { graphic: Phaser.GameObjects.Graphics; left: number; right: number; factor: number }[] = [];
  const track = (graphic: Phaser.GameObjects.Graphics, left: number, right: number, factor = 1) => {
    chunks.push({ graphic, left, right, factor });
  };
  const cull = () => {
    const camera = scene.cameras.main;
    const width = camera.width / camera.zoom;
    for (const chunk of chunks) {
      const left = camera.scrollX * chunk.factor;
      chunk.graphic.setVisible(chunk.right >= left - 256 && chunk.left <= left + width + 256);
    }
  };
  scene.events.on(Phaser.Scenes.Events.PRE_RENDER, cull);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.PRE_RENDER, cull));
  // Graphics renderers replay paths every frame. Keep original geometry/order,
  // but split long scenery into bounded chunks so offscreen paths are skipped.
  const layerChunks = (depth: number, factor: number, color: number, alpha = 1) => {
    const graphics = new Map<number, Phaser.GameObjects.Graphics>();
    return (x: number) => {
      const key = Math.floor(x / 1024);
      let g = graphics.get(key);
      if (!g) {
        g = scene.add.graphics().setDepth(depth).setScrollFactor(factor, 1);
        g.fillStyle(color, alpha);
        graphics.set(key, g);
        track(g, key * 1024 - 320, (key + 1) * 1024 + 400, factor);
      }
      return g;
    };
  };
  scene.cameras.main.setBackgroundColor(theme.sky);
  const horizon = scene.add.graphics().setDepth(-30).setScrollFactor(0);
  horizon.fillStyle(index === 2 ? 0xa55358 : 0xf9f2cd, 0.65);
  horizon.fillCircle(120, 155, index === 2 ? 48 : 34);
  for (let layer = 0; layer < 2; layer++) {
    const graphicAt = layerChunks(-20 + layer, layer === 0 ? 0.18 : 0.43, layer === 0 ? theme.far : theme.near);
    for (let x = -400; x < worldWidth + 2400; x += layer === 0 ? 260 : 160) {
      const g = graphicAt(x);
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
  if (index === 0) {
    const graphicAt = layerChunks(-5, 0.65, 0xffffff, 0.7);
    for (let x = 80; x < worldWidth + 2400; x += 310) {
      const g = graphicAt(x);
      g.fillEllipse(x, 180 + Math.sin(x) * 30, 100, 22); g.fillEllipse(x - 16, 166 + Math.sin(x) * 30, 52, 30);
    }
  } else if (index === 1) {
    const graphicAt = layerChunks(-5, 0.65, 0xe0f7b1, 0.65);
    for (let x = 50; x < worldWidth + 2400; x += 90) graphicAt(x).fillCircle(x, 220 + Math.sin(x) * 140, 2);
  } else {
    const lavaAt = layerChunks(-5, 0.65, 0xe2684d);
    for (let x = -400; x < worldWidth + 2800; x += 1024) lavaAt(x).fillRect(x, 565, Math.min(1024, worldWidth + 2800 - x), 60);
    const rippleAt = layerChunks(-5, 0.65, 0xffbd70);
    for (let x = -400; x < worldWidth + 2400; x += 80) rippleAt(x).fillEllipse(x, 568, 110, 12);
    const sparkAt = layerChunks(-5, 0.65, 0xffce80, 0.7);
    for (let x = 0; x < worldWidth + 2400; x += 130) sparkAt(x).fillCircle(x, 260 + Math.sin(x) * 210, 2);
  }
  return track;
}
