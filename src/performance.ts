import Phaser from 'phaser';

// Opt in on a development server or a mobile test URL with ?perf=1.
// No panel, sampling listener or physics wrapper is created by default.
export function installPerformanceDiagnostics(scene: Phaser.Scene) {
  if (new URLSearchParams(window.location.search).get('perf') !== '1') return;
  const panel = document.createElement('pre');
  panel.setAttribute('aria-label', '개발용 성능 진단');
  panel.style.cssText = 'position:fixed;z-index:99;top:calc(175px + var(--safe-top,0px) + var(--host-top-gap,0px));left:8px;margin:0;padding:8px;border-radius:8px;background:#071524dd;color:#baffd2;font:11px/1.5 monospace;pointer-events:none;white-space:pre-wrap;max-width:calc(100vw - 16px)';
  panel.textContent = '성능 진단 측정 중…';
  document.body.append(panel);
  const world = scene.physics.world;
  const originalSeparate = world.separate;
  let pairTests = 0;
  let frames = 0;
  let elapsed = 0;
  const separate: typeof world.separate = function (...args) {
    pairTests += 1;
    return originalSeparate.apply(world, args);
  };
  world.separate = separate;
  const sample = (_time: number, delta: number) => {
    elapsed += delta;
    frames += 1;
    if (elapsed < 500) return;
    let active = 0;
    let animated = 0;
    let graphics = 0;
    let visibleGraphics = 0;
    let commands = 0;
    for (const object of scene.children.list) {
      if (object.active) active += 1;
      if (object instanceof Phaser.GameObjects.Sprite && object.active && object.anims.isPlaying) animated += 1;
      if (object instanceof Phaser.GameObjects.Graphics) {
        graphics += 1;
        if (object.visible) { visibleGraphics += 1; commands += object.commandBuffer.length; }
      }
    }
    const colliders = world.colliders.getActive().filter((collider) => collider.active).length;
    const dynamicBodies = world.bodies.entries.filter((body) => body.enable).length;
    const staticBodies = world.staticBodies.entries.filter((body) => body.enable).length;
    panel.textContent = [
      `FPS ${scene.game.loop.actualFps.toFixed(1)} · frame ${(elapsed / frames).toFixed(1)}ms`,
      `객체 활성/전체 ${active}/${scene.children.length} · 애니메이션 ${animated}`,
      `Physics 동적/정적 ${dynamicBodies}/${staticBodies}`,
      `활성 Collider/Overlap ${colliders} · 후보 쌍 검사/프레임 ${(pairTests / frames).toFixed(1)}`,
      `Graphics 표시/전체 ${visibleGraphics}/${graphics} · 표시 경로 명령 ${commands}`,
      `텍스처 ${scene.textures.getTextureKeys().length} · 효과 풀 최대 입자 48 / 잔상 6`,
    ].join('\n');
    elapsed = 0; frames = 0; pairTests = 0;
  };
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, sample);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, sample);
    if (world.separate === separate) world.separate = originalSeparate;
    panel.remove();
  });
}
