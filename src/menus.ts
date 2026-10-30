import Phaser from 'phaser';
import { createRobotArt, robotPortraitUrl } from './graphics/robot-art';
import { PORTRAIT_BLINK_KEY, PORTRAIT_KEY } from './graphics/asset-manifest';
import { CHARACTERS, RARITY_LABELS, unlockStage, type Character } from './characters';
import { STAGES_PER_WORLD, WORLD_NAMES, worldOf } from './stage-gen';
import { HP_POINTS, UPGRADES, type StatKey } from './game/config';
import { upgradeCost, upgradeLevel } from './game/economy';
import { buyCharacter, buyItem, equipCharacter, getEquippedRobot, getPlayerProgress, itemCount, savePlayerProgress, useItems, ITEM_IDS, ITEMS, upgradeStat, type ItemId } from './progress';
import type { SceneData } from './game/game-scene';
import { getSoundEnabled, setSoundEnabled } from './audio';
import { STAGES, type StageData } from './stages';
import { bindAppEnvironment } from './app-environment';
import { themeForStage } from './graphics/themes';
import { configureQuality, qualityLevel, type QualitySetting } from './graphics/quality';
import { unbakeAll } from './graphics/art';
import { APPLY_DISPLAY_EVENT } from './graphics/display';
import { cloudSaveStatusText, syncCloudSaveNow } from './cloud-save';
import { resetTips } from './game/tutorial';

type Screen = 'stages' | 'prepare' | 'stats' | 'characters' | 'inventory' | 'settings';
// HP and score carried into the next stage of a run.
type Carry = Pick<SceneData, 'hp' | 'coinCount' | 'enemyScore'>;
const QUALITY_LABELS: Record<QualitySetting, string> = { auto: '자동', low: '낮음', medium: '보통', high: '높음' };
const QUALITY_OPTIONS = Object.keys(QUALITY_LABELS) as QualitySetting[];
const icon = (name: string) => `<i class="icon icon-${name}" aria-hidden="true"></i>`;
const coin = '<i class="coin-icon" aria-hidden="true"></i>';
const ITEM_ICONS: Record<ItemId, string> = { shield: 'shield', 'extra-heart': 'heart', magnet: 'magnet' };

function mount(scene: Phaser.Scene, title: string, content: string, action: (button: HTMLButtonElement) => void) {
  document.body.dataset.screen = document.documentElement.dataset.screen = 'menu';
  // Menus use the default panel colours, not the last stage's theme.
  delete document.body.dataset.theme;
  document.body.style.removeProperty('--accent');
  scene.cameras.main.setBackgroundColor('#1d2a44');
  const root = document.createElement('section'); root.id = 'menu-root'; root.setAttribute('aria-label', title);
  root.innerHTML = `<div class="menu-shell"><header class="menu-heading"><h1>${title}</h1><div class="menu-top-actions"><button type="button" data-action="home">${icon('home')}메인 로비</button></div></header><div class="menu-content">${content}</div></div>`;
  document.body.append(root);
  const click = (event: MouseEvent) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    if (button.dataset.action === 'home') scene.scene.start('MainMenuScene');
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

// The equipped robot, from the baked portrait textures (with its blink).
function robotImage(scene: Phaser.Scene) {
  const robot = getEquippedRobot();
  const blink = scene.textures.exists(PORTRAIT_BLINK_KEY) ? `<img class="robot-preview robot-blink" src="${textureUrl(scene, PORTRAIT_BLINK_KEY)}" alt="">` : '';
  return `<span class="robot-stage"><img class="robot-preview" src="${textureUrl(scene, PORTRAIT_KEY)}" alt="${robot.name}">${blink}</span>`;
}

function characterCard(character: Character, confirming: string) {
  const player = getPlayerProgress();
  const { id, name, rarity, unlock } = character;
  const owned = player.ownedCharacters.includes(id);
  const equipped = player.equippedCharacter === id;
  let action: string;
  if (equipped) action = '<button disabled>장착 중</button>';
  else if (owned) action = `<button data-robot="${id}">장착</button>`;
  else if (unlock.kind === 'coins') action = `<button data-buy-robot="${id}" aria-label="${name} 코인 ${unlock.price}개로 구매" ${player.currency < unlock.price ? 'disabled' : ''}>${confirming === id ? '한 번 더 누르면 구매' : `${coin}${unlock.price}`}</button>`;
  else action = unlock.kind === 'world'
    ? `<button disabled aria-label="월드 ${unlock.world} 클리어로 해금">${icon('lock')}WORLD ${unlock.world}</button>`
    : `<button disabled aria-label="스테이지 ${unlockStage(unlock)} 클리어로 해금">${icon('lock')}STAGE ${unlockStage(unlock)}</button>`;
  return `<article class="char-card${owned ? '' : ' locked'}${equipped ? ' equipped' : ''}" data-rarity="${rarity}"><span class="rarity-badge">${RARITY_LABELS[rarity]}</span><img class="char-portrait" src="${robotPortraitUrl(character)}" alt=""><h3>${name}</h3>${action}</article>`;
}

const STATS: Record<StatKey, { name: string; icon: string; value: (value: number) => string; effect: (value: number) => string }> = {
  attack: { name: '공격력', icon: 'attack', value: (value) => String(value), effect: (value) => `공격 한 번에 ${value} 피해` },
  defense: { name: '방어력', icon: 'shield', value: (value) => `${value}%`, effect: (value) => `맞으면 HP ${Math.round(HP_POINTS * (100 - value) / 100)} 감소` },
  maxHp: { name: '최대 HP', icon: 'heart', value: (value) => `HP ${value * HP_POINTS}`, effect: (value) => `HP ${value * HP_POINTS}로 시작` },
};

function upgradeCard(stat: StatKey) {
  const { stats, currency } = getPlayerProgress();
  const rule = UPGRADES[stat];
  const info = STATS[stat];
  const value = stats[stat];
  const cost = upgradeCost(value, rule);
  const change = cost === null ? `${info.value(value)} · 최대` : `${info.value(value)} → ${info.value(value + rule.step)}`;
  const button = cost === null
    ? '<button disabled>MAX</button>'
    : `<button data-upgrade="${stat}" aria-label="${info.name} 강화, 코인 ${cost}개" ${currency < cost ? 'disabled' : ''}>${coin}${cost}</button>`;
  return `<article class="boost-card upgrade-card" data-stat="${stat}"><span class="boost-icon">${icon(info.icon)}</span><h3>${info.name} <small>Lv ${upgradeLevel(value, rule)} / ${rule.costs.length}</small></h3><p>${info.effect(value)}</p><span class="boost-owned">${change}</span><div class="boost-actions">${button}</div></article>`;
}

function upgradesContent() {
  const { currency } = getPlayerProgress();
  return `<div class="prepare"><div class="prepare-head"><h2>영구 강화</h2><span class="chip">${coin}코인 ${currency}</span></div><p class="prepare-hint">코인으로 올린 능력치는 모든 스테이지에 계속 적용돼요</p><div class="boost-grid">${(Object.keys(UPGRADES) as StatKey[]).map(upgradeCard).join('')}</div></div>`;
}

function charactersContent(confirming: string) {
  const player = getPlayerProgress();
  const owned = CHARACTERS.filter((character) => player.ownedCharacters.includes(character.id)).length;
  return `<div class="collection"><div class="prepare-head"><h2>보유 ${owned} / ${CHARACTERS.length}</h2><span class="chip">${coin}코인 ${player.currency}</span></div><p class="prepare-hint">일반은 스테이지를 깨면, 영웅은 월드를 처음 끝내면 얻어요 · 희귀와 전설은 코인으로 해금해요</p><div class="char-grid">${CHARACTERS.map((character) => characterCard(character, confirming)).join('')}</div></div>`;
}

function stageCard(stage: StageData, index: number, unlocked: number) {
  const status = index + 1 > unlocked ? 'locked' : index + 1 < unlocked ? 'cleared' : 'current';
  const label = status === 'locked' ? `${icon('lock')}잠김` : status === 'cleared' ? `${icon('check')}클리어` : '도전!';
  return `<button class="stage-card" data-stage="${index}" data-status="${status}" ${status === 'locked' ? 'disabled' : ''}><span class="stage-thumb" aria-hidden="true"><span class="stage-number">${index + 1}</span>${(index + 1) % STAGES_PER_WORLD === 0 ? '<span class="stage-final">FINAL</span>' : ''}</span><span class="stage-name">${status === 'locked' ? '? ? ?' : stage.name}</span><span class="stage-status">${label}</span></button>`;
}

function prepareContent(stageIndex: number, picked: ReadonlySet<ItemId>) {
  const { currency } = getPlayerProgress();
  const cards = ITEM_IDS.map((id) => {
    const item = ITEMS[id];
    const owned = itemCount(id);
    const on = owned > 0 && picked.has(id);
    return `<article class="boost-card${on ? ' picked' : ''}" data-item="${id}"><span class="boost-icon">${icon(ITEM_ICONS[id])}</span><h3>${item.name}</h3><p>${item.description}</p><span class="boost-owned">보유 ${owned}개</span><div class="boost-actions"><button data-pick="${id}" aria-pressed="${on}" ${owned ? '' : 'disabled'}>${on ? `${icon('check')}사용` : '사용하기'}</button><button data-buy="${id}" aria-label="${item.name} 코인 ${item.price}개로 구매" ${currency < item.price ? 'disabled' : ''}>${coin}${item.price}</button></div></article>`;
  }).join('');
  return `<div class="prepare"><div class="prepare-head"><h2>STAGE ${stageIndex + 1} · ${STAGES[stageIndex].name}</h2><span class="chip">${coin}코인 ${currency}</span></div><p class="prepare-hint">이번 판에 쓸 아이템을 고르세요 · 출발하면 고른 아이템이 1개씩 쓰여요</p><div class="boost-grid">${cards}</div><div class="prepare-actions"><button data-action="stages">스테이지 선택</button><button data-action="start" class="menu-primary">${icon('play')}출발!</button></div></div>`;
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
    mount(this, '메인 로비', `<div class="lobby-hero"><div class="logo"><p class="logo-title"><span>SPIN</span>BOUND</p><p class="logo-tagline">달리고, 구르고, 더 멀리!</p></div><article class="robot-card">${robotImage(this)}<h2>${robot.name}</h2><p class="chips"><span class="chip">레벨 ${player.level}</span><span class="chip"><i class="coin-icon" aria-hidden="true"></i>코인 ${player.currency}</span><span class="chip">${icon('flag')}${unlocked} / ${STAGES.length}</span></p></article></div><div class="menu-grid"><button data-screen="stages" class="menu-primary">${icon('play')}게임 시작</button><button data-screen="stats">${icon('upgrade')}강화</button><button data-screen="characters">${icon('robot')}캐릭터</button><button data-screen="inventory">${icon('box')}보관함</button><button data-screen="settings">${icon('settings')}설정</button></div>`, (button) => {
      const screen = button.dataset.screen;
      if (screen) this.scene.start('MenuScreenScene', { screen });
    });
  }
}

export class MenuScreenScene extends Phaser.Scene {
  private screen: Screen = 'stages';
  private stageIndex = 0;
  private carry: Carry = {};
  private picked = new Set<ItemId>();
  private world = 1;
  private confirming = '';
  constructor() { super('MenuScreenScene'); }
  init(data: { screen?: Screen; stageIndex?: number; carry?: Carry; world?: number }) {
    this.screen = data.screen ?? 'stages';
    const worlds = Math.ceil(STAGES.length / STAGES_PER_WORLD);
    this.world = Phaser.Math.Clamp(data.world ?? worldOf(Math.min(getPlayerProgress().unlockedStage, STAGES.length) - 1), 1, worlds);
    this.confirming = '';
    this.stageIndex = Math.floor(data.stageIndex ?? 0);
    this.carry = data.carry ?? {};
    this.picked = new Set();
    if (this.screen === 'prepare' && !(this.stageIndex >= 0 && this.stageIndex < Math.min(getPlayerProgress().unlockedStage, STAGES.length))) this.screen = 'stages';
  }
  create() {
    createRobotArt(this);
    const player = getPlayerProgress();
    const titles: Record<Screen, string> = { stages: '스테이지 선택', prepare: '출전 준비', stats: '강화 · 능력치', characters: '캐릭터 도감', inventory: '보관함', settings: '설정' };
    let content = '';
    if (this.screen === 'stages') {
      const unlocked = Math.min(player.unlockedStage, STAGES.length);
      const first = (this.world - 1) * STAGES_PER_WORLD;
      const worlds = Math.ceil(STAGES.length / STAGES_PER_WORLD);
      const cards = STAGES.slice(first, first + STAGES_PER_WORLD).map((stage, offset) => stageCard(stage, first + offset, unlocked)).join('');
      content = `<div class="world-bar"><button data-world-step="-1" aria-label="이전 월드" ${this.world > 1 ? '' : 'disabled'}>${icon('left')}</button><h2>WORLD ${this.world} · ${WORLD_NAMES[this.world - 1]}</h2><button data-world-step="1" aria-label="다음 월드" ${this.world < worlds ? '' : 'disabled'}>${icon('right')}</button></div><div class="stage-progress"><span>${icon('flag')}해금</span><i class="progress-track"><b></b></i><strong>${unlocked} / ${STAGES.length}</strong></div><div class="stage-grid">${cards}</div>`;
    }
    if (this.screen === 'prepare') content = prepareContent(this.stageIndex, this.picked);
    if (this.screen === 'stats') content = upgradesContent();
    if (this.screen === 'characters') content = charactersContent(this.confirming);
    if (this.screen === 'inventory') {
      const owned = ITEM_IDS.filter((id) => itemCount(id) > 0);
      content = `<article class="menu-panel"><h2>보유 아이템 ${player.items.length}개</h2>${owned.length ? `<ul class="item-grid">${owned.map((id) => `<li>${icon(ITEM_ICONS[id])}${ITEMS[id].name} ×${itemCount(id)}</li>`).join('')}</ul>` : `<div class="empty-state">${icon('box')}<p>보유한 아이템이 없습니다.</p></div>`}<p>아이템은 스테이지를 고른 뒤 출전 준비 화면에서 코인으로 살 수 있어요.</p></article>`;
    }
    if (this.screen === 'settings') content = `<article class="menu-panel settings-panel"><section class="setting"><h2>${icon('sound-on')}사운드</h2><button data-action="sound" aria-pressed="${getSoundEnabled()}">사운드 ${getSoundEnabled() ? 'ON' : 'OFF'}</button></section><section class="setting"><h2>${icon('settings')}그래픽 품질</h2><div class="segmented" role="group" aria-label="그래픽 품질">${QUALITY_OPTIONS.map((value) => `<button data-quality="${value}" aria-pressed="${player.graphicsQuality === value}">${QUALITY_LABELS[value]}</button>`).join('')}</div><p>현재 적용 ${QUALITY_LABELS[qualityLevel()]} · 낮음은 배경 레이어와 효과 수를 줄입니다</p></section><section class="setting"><h2>${icon('box')}클라우드 저장</h2><p data-cloud-status>${cloudSaveStatusText()}</p><button data-action="cloud-sync">지금 동기화</button></section><section class="setting"><h2>${icon('flag')}튜토리얼</h2><p>스테이지 1의 기능 설명을 다시 멈춰서 보여줘요</p><button data-action="tips-reset">튜토리얼 다시 보기</button></section></article>`;
    const root = mount(this, titles[this.screen], content, (button) => {
      if (button.dataset.stage !== undefined) {
        const stageIndex = Number(button.dataset.stage);
        if (Number.isInteger(stageIndex) && stageIndex >= 0 && stageIndex < Math.min(player.unlockedStage, STAGES.length)) this.scene.start('MenuScreenScene', { screen: 'prepare', stageIndex });
      } else if (button.dataset.buy || button.dataset.pick) {
        const id = (button.dataset.buy ?? button.dataset.pick) as ItemId;
        if (!ITEM_IDS.includes(id)) return;
        if (button.dataset.buy) { if (buyItem(id)) this.picked.add(id); }
        else if (this.picked.has(id)) this.picked.delete(id);
        else this.picked.add(id);
        root.querySelector('.menu-content')!.innerHTML = prepareContent(this.stageIndex, this.picked);
        root.querySelector<HTMLButtonElement>(`[data-${button.dataset.buy ? 'buy' : 'pick'}="${id}"]`)?.focus({ preventScroll: true });
      } else if (button.dataset.action === 'start') {
        const boosts = useItems(ITEM_IDS.filter((id) => this.picked.has(id)));
        this.scene.start('GameScene', { ...this.carry, stageIndex: this.stageIndex, boosts } satisfies SceneData);
      } else if (button.dataset.action === 'stages') {
        this.scene.restart({ screen: 'stages' });
      } else if (button.dataset.upgrade) {
        upgradeStat(button.dataset.upgrade as StatKey);
        root.querySelector('.menu-content')!.innerHTML = upgradesContent();
        root.querySelector<HTMLButtonElement>(`[data-upgrade="${button.dataset.upgrade}"]`)?.focus({ preventScroll: true });
      } else if (button.dataset.worldStep) {
        this.scene.restart({ screen: 'stages', world: this.world + Number(button.dataset.worldStep) });
      } else if (button.dataset.robot || button.dataset.buyRobot) {
        // Re-render in place so the long list keeps its scroll position.
        if (button.dataset.robot) { equipCharacter(button.dataset.robot); this.confirming = ''; }
        else if (this.confirming === button.dataset.buyRobot) { buyCharacter(button.dataset.buyRobot!); this.confirming = ''; }
        else this.confirming = button.dataset.buyRobot!;
        const scroll = root.scrollTop;
        root.querySelector('.menu-content')!.innerHTML = charactersContent(this.confirming);
        root.scrollTop = scroll;
      } else if (button.dataset.action === 'sound') {
        setSoundEnabled(!getSoundEnabled()); button.textContent = `사운드 ${getSoundEnabled() ? 'ON' : 'OFF'}`; button.setAttribute('aria-pressed', String(getSoundEnabled()));
      } else if (button.dataset.action === 'tips-reset') {
        resetTips();
        button.disabled = true;
        button.textContent = '다음 스테이지 1부터 다시 보여줘요';
      } else if (button.dataset.action === 'cloud-sync') {
        const text = root.querySelector('[data-cloud-status]')!;
        button.disabled = true;
        text.textContent = '동기화 중…';
        void syncCloudSaveNow().finally(() => { button.disabled = false; text.textContent = cloudSaveStatusText(); });
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
