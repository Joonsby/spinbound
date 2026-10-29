import Phaser from 'phaser';
import { createRobotArt } from './graphics/robot-art';
import { getEquippedRobot, getPlayerProgress, savePlayerProgress, ROBOTS, ITEMS } from './progress';
import { getSoundEnabled, setSoundEnabled } from './audio';
import { STAGES, type StageData } from './stages';
import { bindAppEnvironment } from './app-environment';
import { themeForStage } from './graphics/themes';
import { configureQuality, qualityLevel, type QualitySetting } from './graphics/quality';
import { unbakeAll } from './graphics/art';
import { APPLY_DISPLAY_EVENT } from './graphics/display';

type Screen = 'stages' | 'stats' | 'characters' | 'inventory' | 'settings';
const QUALITY_LABELS: Record<QualitySetting, string> = { auto: '자동', low: '낮음', medium: '보통', high: '높음' };
const QUALITY_OPTIONS = Object.keys(QUALITY_LABELS) as QualitySetting[];
const icon = (name: string) => `<i class="icon icon-${name}" aria-hidden="true"></i>`;

function mount(scene: Phaser.Scene, title: string, content: string, action: (button: HTMLButtonElement) => void) {
  document.body.dataset.screen = document.documentElement.dataset.screen = 'menu';
  // Menus use the default panel colours, not the last stage's theme.
  delete document.body.dataset.theme;
  document.body.style.removeProperty('--accent');
  scene.cameras.main.setBackgroundColor('#1d2a44');
  const root = document.createElement('section'); root.id = 'menu-root'; root.setAttribute('aria-label', title);
  root.innerHTML = `<div class="menu-shell"><header class="menu-heading"><h1>${title}</h1><div class="menu-top-actions"><button type="button" data-action="boss">${icon('boss')}보스 테스트</button><button type="button" data-action="home">${icon('home')}메인 로비</button></div></header><div class="menu-content">${content}</div></div>`;
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

// Painted textures are canvases; a delivered PNG is an image element.
function textureUrl(scene: Phaser.Scene, key: string) {
  const source = scene.textures.get(key).getSourceImage();
  return source instanceof HTMLCanvasElement ? source.toDataURL() : (source as HTMLImageElement).src;
}

function robotImage(scene: Phaser.Scene, id = getEquippedRobot().id) {
  const robot = ROBOTS.find((item) => item.id === id) ?? ROBOTS[0];
  const blink = scene.textures.exists(robot.blinkTexture) ? `<img class="robot-preview robot-blink" src="${textureUrl(scene, robot.blinkTexture)}" alt="">` : '';
  return `<span class="robot-stage"><img class="robot-preview" src="${textureUrl(scene, robot.texture)}" alt="${robot.name}">${blink}</span>`;
}

function stageCard(stage: StageData, index: number, unlocked: number) {
  const status = index + 1 > unlocked ? 'locked' : index + 1 < unlocked ? 'cleared' : 'current';
  const label = status === 'locked' ? `${icon('lock')}잠김` : status === 'cleared' ? `${icon('check')}클리어` : '도전!';
  return `<button class="stage-card" data-stage="${index}" data-status="${status}" ${status === 'locked' ? 'disabled' : ''}><span class="stage-thumb" aria-hidden="true"><span class="stage-number">${index + 1}</span>${stage.boss ? '<span class="stage-boss">BOSS</span>' : ''}</span><span class="stage-name">${status === 'locked' ? '? ? ?' : stage.name}</span><span class="stage-status">${label}</span></button>`;
}

// Thumbnail colours come from the stage themes (set through CSSOM, no inline style markup).
function paintStageCards(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('.stage-card').forEach((card) => {
    const theme = themeForStage(STAGES[Number(card.dataset.stage)].theme);
    const colors = { '--sky0': theme.sky[0], '--sky1': theme.sky[1], '--sky2': theme.sky[2], '--sun': theme.sun.color, '--far': theme.far.base, '--hill': theme.near.base, '--grass': theme.grass[1], '--soil': theme.soil[1] };
    for (const [name, value] of Object.entries(colors)) card.style.setProperty(name, value);
  });
}

export class MainMenuScene extends Phaser.Scene {
  constructor() { super('MainMenuScene'); }
  create() {
    createRobotArt(this);
    const player = getPlayerProgress();
    const robot = getEquippedRobot();
    const unlocked = Math.min(player.unlockedStage, STAGES.length);
    mount(this, '메인 로비', `<div class="lobby-hero"><div class="logo"><p class="logo-title"><span>SPIN</span>BOUND</p><p class="logo-tagline">달리고, 구르고, 더 멀리!</p></div><article class="robot-card">${robotImage(this)}<h2>${robot.name}</h2><p class="chips"><span class="chip">레벨 ${player.level}</span><span class="chip">${icon('gem')}재화 ${player.currency}</span><span class="chip">${icon('flag')}${unlocked} / ${STAGES.length}</span></p></article></div><div class="menu-grid"><button data-screen="stages" class="menu-primary">${icon('play')}게임 시작</button><button data-screen="stats">${icon('upgrade')}강화</button><button data-screen="characters">${icon('robot')}캐릭터</button><button data-screen="inventory">${icon('box')}보관함</button><button data-screen="settings">${icon('settings')}설정</button></div>`, (button) => {
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
    createRobotArt(this);
    const player = getPlayerProgress();
    const titles: Record<Screen, string> = { stages: '스테이지 선택', stats: '강화 · 능력치', characters: '보유 로봇', inventory: '보관함', settings: '설정' };
    let content = '';
    if (this.screen === 'stages') {
      const unlocked = Math.min(player.unlockedStage, STAGES.length);
      content = `<div class="stage-progress"><span>${icon('flag')}해금</span><i class="progress-track"><b></b></i><strong>${unlocked} / ${STAGES.length}</strong></div><div class="stage-grid">${STAGES.map((stage, index) => stageCard(stage, index, unlocked)).join('')}</div>`;
    }
    if (this.screen === 'stats') content = `<article class="menu-panel"><h2>현재 능력치</h2><dl class="stat-list"><div><dt>${icon('attack')}공격력</dt><dd>${player.stats.attack}</dd></div><div><dt>${icon('shield')}방어력</dt><dd>${player.stats.defense}%</dd></div><div><dt>${icon('heart')}HP</dt><dd>${player.stats.maxHp}</dd></div></dl><p>강화 구매는 준비 중입니다.</p></article>`;
    if (this.screen === 'characters') content = `<div class="robot-roster">${ROBOTS.filter((robot) => player.ownedCharacters.includes(robot.id)).map((robot) => `<article class="robot-card${player.equippedCharacter === robot.id ? ' equipped' : ''}">${robotImage(this, robot.id)}<h2>${robot.name}</h2><button data-robot="${robot.id}" ${player.equippedCharacter === robot.id ? 'disabled' : ''}>${player.equippedCharacter === robot.id ? '장착 중' : '선택'}</button></article>`).join('')}</div>`;
    if (this.screen === 'inventory') content = `<article class="menu-panel"><h2>보유 아이템 ${player.items.length}개</h2>${player.items.length ? `<ul class="item-grid">${player.items.map((id) => `<li>${icon('box')}${ITEMS[id]}</li>`).join('')}</ul>` : `<div class="empty-state">${icon('box')}<p>보유한 아이템이 없습니다.</p></div>`}</article>`;
    if (this.screen === 'settings') content = `<article class="menu-panel settings-panel"><section class="setting"><h2>${icon('sound-on')}사운드</h2><button data-action="sound" aria-pressed="${getSoundEnabled()}">사운드 ${getSoundEnabled() ? 'ON' : 'OFF'}</button></section><section class="setting"><h2>${icon('settings')}그래픽 품질</h2><div class="segmented" role="group" aria-label="그래픽 품질">${QUALITY_OPTIONS.map((value) => `<button data-quality="${value}" aria-pressed="${player.graphicsQuality === value}">${QUALITY_LABELS[value]}</button>`).join('')}</div><p>현재 적용 ${QUALITY_LABELS[qualityLevel()]} · 낮음은 배경 레이어와 효과 수를 줄입니다</p></section></article>`;
    const root = mount(this, titles[this.screen], content, (button) => {
      if (button.dataset.stage !== undefined) {
        const stageIndex = Number(button.dataset.stage);
        if (Number.isInteger(stageIndex) && stageIndex >= 0 && stageIndex < Math.min(player.unlockedStage, STAGES.length)) this.scene.start('GameScene', { stageIndex });
      } else if (button.dataset.robot && player.ownedCharacters.includes(button.dataset.robot)) {
        player.equippedCharacter = button.dataset.robot; savePlayerProgress(player); this.scene.restart({ screen: this.screen });
      } else if (button.dataset.action === 'sound') {
        setSoundEnabled(!getSoundEnabled()); button.textContent = `사운드 ${getSoundEnabled() ? 'ON' : 'OFF'}`; button.setAttribute('aria-pressed', String(getSoundEnabled()));
      } else if (button.dataset.quality) {
        const value = button.dataset.quality as QualitySetting;
        if (!QUALITY_OPTIONS.includes(value) || value === player.graphicsQuality) return;
        player.graphicsQuality = value; savePlayerProgress(player);
        configureQuality(value);
        // Repaint at the new texture scale and resize the canvas to the new render-scale cap.
        unbakeAll(this);
        this.game.events.emit(APPLY_DISPLAY_EVENT);
        this.scene.restart({ screen: this.screen });
      }
    });
    if (this.screen === 'stages') {
      paintStageCards(root);
      root.querySelector<HTMLElement>('.progress-track')?.style.setProperty('--progress', String(Math.min(player.unlockedStage, STAGES.length) / STAGES.length));
    }
  }
}
