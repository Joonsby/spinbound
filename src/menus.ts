import Phaser from 'phaser';
import { createTextures } from './visuals';
import { getEquippedRobot, getPlayerProgress, savePlayerProgress, ROBOTS, ITEMS } from './progress';
import { getSoundEnabled, setSoundEnabled } from './audio';
import { STAGES } from './stages';
import { bindAppEnvironment } from './app-environment';

type Screen = 'stages' | 'stats' | 'characters' | 'inventory' | 'settings';
function mount(scene: Phaser.Scene, title: string, content: string, action: (button: HTMLButtonElement) => void) {
  document.body.dataset.screen = document.documentElement.dataset.screen = 'menu';
  scene.cameras.main.setBackgroundColor('#172e38');
  const root = document.createElement('section'); root.id = 'menu-root'; root.setAttribute('aria-label', title);
  root.innerHTML = `<div class="menu-shell"><header class="menu-heading"><h1>${title}</h1><div class="menu-top-actions"><button type="button" data-action="boss">보스 테스트</button><button type="button" data-action="home">메인 로비</button></div></header><div class="menu-content">${content}</div></div>`;
  document.body.append(root);
  const click = (event: MouseEvent) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    if (button.dataset.action === 'boss') scene.scene.start('GameScene', { stageIndex: 2, bossTest: true });
    else if (button.dataset.action === 'home') scene.scene.start('MainMenuScene');
    else action(button);
  };
  root.addEventListener('click', click);
  const unbind = bindAppEnvironment(scene, () => {}, () => {}, () => {});
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { unbind(); root.removeEventListener('click', click); root.remove(); });
  return root;
}
function robotImage(scene: Phaser.Scene, id = getEquippedRobot().id) {
  const robot = ROBOTS.find((item) => item.id === id) ?? ROBOTS[0];
  const canvas = scene.textures.get(robot.texture).getSourceImage() as HTMLCanvasElement;
  return `<img class="robot-preview" src="${canvas.toDataURL()}" alt="${robot.name}">`;
}

export class MainMenuScene extends Phaser.Scene {
  constructor() { super('MainMenuScene'); }
  create() {
    createTextures(this);
    const player = getPlayerProgress();
    const robot = getEquippedRobot();
    mount(this, 'SPINBOUND · 메인 로비', `<article class="robot-card">${robotImage(this)}<h2>${robot.name}</h2><p>레벨 ${player.level} · 보유 재화 ${player.currency}</p></article><div class="menu-grid"><button data-screen="stages" class="menu-primary">게임 시작</button><button data-screen="stats">강화</button><button data-screen="characters">캐릭터</button><button data-screen="inventory">보관함</button><button data-screen="settings">설정</button></div>`, (button) => {
      const screen = button.dataset.screen;
      if (screen) this.scene.start('MenuScreenScene', { screen });
    });
  }
}

export class MenuScreenScene extends Phaser.Scene {
  private screen: Screen = 'stages';
  constructor() { super('MenuScreenScene'); }
  init(data: { screen?: Screen }) { this.screen = data.screen ?? 'stages'; }
  create() {
    createTextures(this);
    const player = getPlayerProgress();
    const titles: Record<Screen, string> = { stages: '스테이지 선택', stats: '강화 · 능력치', characters: '보유 로봇', inventory: '보관함', settings: '설정' };
    let content = '';
    if (this.screen === 'stages') content = `<div class="stage-grid">${STAGES.map((stage, index) => `<button data-stage="${index}" ${index + 1 > player.unlockedStage ? 'disabled' : ''}>Stage ${index + 1}<small>${index + 1 > player.unlockedStage ? '잠김' : stage.name}</small></button>`).join('')}</div>`;
    if (this.screen === 'stats') content = `<article class="menu-panel"><h2>현재 능력치</h2><dl class="stat-list"><dt>공격력</dt><dd>${player.stats.attack}</dd><dt>방어력</dt><dd>${player.stats.defense}%</dd><dt>HP</dt><dd>${player.stats.maxHp}</dd></dl><p>강화 구매는 준비 중입니다.</p></article>`;
    if (this.screen === 'characters') content = `<div class="menu-grid">${ROBOTS.filter((robot) => player.ownedCharacters.includes(robot.id)).map((robot) => `<article class="robot-card">${robotImage(this, robot.id)}<h2>${robot.name}</h2><button data-robot="${robot.id}" ${player.equippedCharacter === robot.id ? 'disabled' : ''}>${player.equippedCharacter === robot.id ? '장착 중' : '선택'}</button></article>`).join('')}</div>`;
    if (this.screen === 'inventory') content = `<article class="menu-panel"><h2>보유 아이템 ${player.items.length}개</h2>${player.items.length ? `<ul>${player.items.map((id) => `<li>${ITEMS[id]}</li>`).join('')}</ul>` : '<p>보유한 아이템이 없습니다.</p>'}</article>`;
    if (this.screen === 'settings') content = `<article class="menu-panel"><h2>사운드</h2><button data-action="sound" aria-pressed="${getSoundEnabled()}">사운드 ${getSoundEnabled() ? 'ON' : 'OFF'}</button></article>`;
    mount(this, titles[this.screen], content, (button) => {
      if (button.dataset.stage !== undefined) {
        const stageIndex = Number(button.dataset.stage);
        if (Number.isInteger(stageIndex) && stageIndex >= 0 && stageIndex < Math.min(player.unlockedStage, STAGES.length)) this.scene.start('GameScene', { stageIndex });
      } else if (button.dataset.robot && player.ownedCharacters.includes(button.dataset.robot)) {
        player.equippedCharacter = button.dataset.robot; savePlayerProgress(player); this.scene.restart({ screen: this.screen });
      } else if (button.dataset.action === 'sound') {
        setSoundEnabled(!getSoundEnabled()); button.textContent = `사운드 ${getSoundEnabled() ? 'ON' : 'OFF'}`; button.setAttribute('aria-pressed', String(getSoundEnabled()));
      }
    });
  }
}
