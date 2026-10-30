// Playable robots. All share one rig and differ in paint and shape; rarity decides how each one is earned.
// Pure data (no Phaser): progress validation and the Node tests import it.
import { STAGES_PER_WORLD } from './stage-gen.ts';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type Unlock =
  | { kind: 'start' }
  // First clear of this stage (1-based) unlocks it automatically.
  | { kind: 'clear'; stage: number }
  | { kind: 'coins'; price: number }
  // First clear of this world's last stage.
  | { kind: 'world'; world: number }
  // Reached this many days of attendance in total.
  | { kind: 'attendance'; days: number };
// Base colours; shades are derived in robot-art.
export type RobotPaint = { accent: string; body: string; eye: string; visor: string; metal: string };
// Shape choices painted onto the shared rig; anything left out keeps the original robot's part.
export type RobotLook = {
  head?: 'dome' | 'box';
  ears?: 'fin' | 'antenna' | 'horn' | 'cat' | 'bunny' | 'bear' | 'wing' | 'bolt' | 'leaf';
  eyes?: 'pill' | 'round' | 'visor' | 'mono' | 'sharp' | 'heart' | 'star';
  crest?: 'crown' | 'tiara' | 'bow' | 'flower' | 'halo' | 'mohawk' | 'flame' | 'vfin' | 'horn' | 'propeller' | 'sprout';
  chest?: 'core' | 'star' | 'heart' | 'bolt' | 'diamond';
  cheeks?: boolean;
  stripe?: boolean;
};
export type Character = { id: string; name: string; rarity: Rarity; unlock: Unlock; paint: RobotPaint; look: RobotLook };

export const RARITY_LABELS: Record<Rarity, string> = { common: '일반', rare: '희귀', epic: '영웅', legendary: '전설' };

const paint = (accent: string, body = '#F6F3EE', eye = '#5CF2FF', visor = '#2B3654', metal = '#4A5466'): RobotPaint => ({ accent, body, eye, visor, metal });
const robot = (id: string, name: string, rarity: Rarity, unlock: Unlock, colors: RobotPaint, look: RobotLook = {}): Character => ({ id, name, rarity, unlock, paint: colors, look });
const clear = (stage: number): Unlock => ({ kind: 'clear', stage });
const coins = (price: number): Unlock => ({ kind: 'coins', price });
const world = (number: number): Unlock => ({ kind: 'world', world: number });
const attendance = (days: number): Unlock => ({ kind: 'attendance', days });

export const CHARACTERS: Character[] = [
  robot('orange-01', '오렌지-01', 'common', { kind: 'start' }, paint('#FF8A1F')),
  // Common: handed out along the way, front-loaded so early clears pay off quickly.
  robot('mint-02', '민트-02', 'common', clear(1), paint('#3FD6A0'), { ears: 'antenna', eyes: 'round', cheeks: true }),
  robot('lemon-03', '레몬-03', 'common', clear(2), paint('#FFD23F'), { head: 'box', ears: 'bolt', chest: 'bolt' }),
  robot('sky-04', '스카이-04', 'common', clear(4), paint('#4FA8FF'), { ears: 'wing', eyes: 'round', crest: 'propeller' }),
  robot('cherry-05', '체리-05', 'common', clear(6), paint('#FF4F6D'), { eyes: 'sharp', chest: 'star', stripe: true }),
  robot('lime-06', '라임-06', 'common', clear(8), paint('#9BE040'), { eyes: 'round', crest: 'sprout', cheeks: true }),
  robot('peach-07', '피치-07', 'common', clear(12), paint('#FF9E8A'), { ears: 'cat', eyes: 'round', chest: 'heart', cheeks: true }),
  robot('cocoa-08', '코코아-08', 'common', clear(16), paint('#A8683E'), { ears: 'bear', eyes: 'round', cheeks: true }),
  robot('lavender-09', '라벤더-09', 'common', clear(22), paint('#B48CFF'), { ears: 'bunny', eyes: 'heart', crest: 'bow' }),
  robot('ocean-10', '바다-10', 'common', clear(28), paint('#1FB5C9', '#EEF8FA'), { head: 'box', ears: 'antenna', eyes: 'visor' }),
  robot('forest-11', '숲-11', 'common', clear(36), paint('#3E9E4F', '#F1F5EC'), { ears: 'leaf', eyes: 'round', crest: 'flower' }),
  robot('sand-12', '모래-12', 'common', clear(44), paint('#E0B060', '#FBF4E6'), { head: 'box', ears: 'antenna', eyes: 'mono' }),
  robot('sunset-13', '노을-13', 'common', clear(54), paint('#FF6A3D', '#FFF1E8', '#FFD25C'), { eyes: 'sharp', crest: 'mohawk', stripe: true }),
  robot('snow-14', '눈꽃-14', 'common', clear(64), paint('#8EC9FF', '#FFFFFF', '#BFE9FF'), { ears: 'bunny', eyes: 'round', chest: 'diamond', cheeks: true }),
  robot('plum-15', '자두-15', 'common', clear(76), paint('#8E3FA8', '#F6EEF8', '#FF9CE6'), { eyes: 'heart', crest: 'tiara', cheeks: true }),
  robot('cloud-16', '구름-16', 'common', clear(88), paint('#9FB2C8', '#FFFFFF', '#7CE3FF'), { ears: 'wing', eyes: 'round', crest: 'halo' }),
  // Rare: bought with coins; coloured shells instead of the white helmet.
  robot('ruby', '루비', 'rare', coins(2000), paint('#FFD86B', '#E8475F', '#FFF1A8', '#3A1420'), { head: 'box', ears: 'horn', eyes: 'sharp', chest: 'diamond' }),
  robot('sapphire', '사파이어', 'rare', coins(2200), paint('#FFC44D', '#3A6FE0', '#9FF0FF', '#141E46'), { ears: 'wing', eyes: 'visor', chest: 'diamond', stripe: true }),
  robot('emerald', '에메랄드', 'rare', coins(2400), paint('#F5F1E6', '#2FA866', '#C8FF9C', '#10301F'), { ears: 'leaf', crest: 'tiara', chest: 'diamond' }),
  robot('topaz', '토파즈', 'rare', coins(2600), paint('#7A4BD8', '#FFC43D', '#FFFFFF', '#3A2A10'), { head: 'box', ears: 'bolt', eyes: 'mono', chest: 'bolt' }),
  robot('amethyst', '자수정', 'rare', coins(2800), paint('#FFD0F4', '#8C4FD6', '#FF8CF0', '#22123A'), { ears: 'cat', eyes: 'star', crest: 'tiara', cheeks: true }),
  robot('coral', '산호', 'rare', coins(3000), paint('#2EC4B6', '#FF7F6E', '#FFF6C2', '#3A1A1A'), { eyes: 'round', crest: 'flower', chest: 'heart', cheeks: true }),
  robot('aurora', '오로라', 'rare', coins(3200), paint('#7CFFB2', '#2C3E70', '#B8FFEC', '#0E1730', '#6E7FA8'), { ears: 'antenna', eyes: 'star', crest: 'halo' }),
  robot('neon', '네온', 'rare', coins(3400), paint('#FF3FD2', '#22252E', '#3FFF9C', '#0A0B10', '#3A3F4C'), { head: 'box', eyes: 'visor', crest: 'mohawk', stripe: true }),
  robot('carbon', '카본', 'rare', coins(3600), paint('#FF8A1F', '#3A3F4A', '#FF6A3D', '#101218', '#25292F'), { head: 'box', ears: 'horn', eyes: 'sharp', stripe: true }),
  robot('chrome', '크롬', 'rare', coins(3800), paint('#5CF2FF', '#C9D2DE', '#FFFFFF', '#1E2A3C', '#8D97A8'), { ears: 'antenna', eyes: 'visor', chest: 'bolt' }),
  robot('blossom', '벚꽃', 'rare', coins(4000), paint('#FF8FB8', '#FFE4EE', '#FF5C9A', '#4A2034'), { ears: 'cat', eyes: 'heart', crest: 'flower', chest: 'heart', cheeks: true }),
  robot('abyss', '심해', 'rare', coins(4400), paint('#29E0FF', '#16305A', '#29E0FF', '#060C1A', '#2A3C5C'), { ears: 'antenna', eyes: 'mono', chest: 'diamond' }),
  // Epic: the first clear of each world.
  robot('forge-knight', '포지 나이트', 'epic', world(1), paint('#FF5A1F', '#4A4E5A', '#FFB13D', '#16181E', '#30343C'), { head: 'box', ears: 'horn', eyes: 'visor', crest: 'mohawk', chest: 'star' }),
  robot('moss-guard', '모스 가드', 'epic', world(2), paint('#B6F04A', '#2E5A34', '#E8FF7A', '#0E1E10', '#3C4E3A'), { head: 'box', ears: 'leaf', eyes: 'mono', chest: 'diamond' }),
  robot('magma-core', '마그마 코어', 'epic', world(3), paint('#FFC93D', '#7A1E14', '#FF5A2A', '#1E0806', '#4A2A24'), { ears: 'horn', eyes: 'sharp', crest: 'flame' }),
  robot('gale-wing', '게일 윙', 'epic', world(4), paint('#E8FBFF', '#4FC3E8', '#FFFFFF', '#103448', '#6A8EA0'), { ears: 'wing', eyes: 'visor', chest: 'bolt', stripe: true }),
  robot('fog-shade', '포그 셰이드', 'epic', world(5), paint('#C9B8FF', '#5A5470', '#E2D6FF', '#18142A', '#4C4860'), { ears: 'cat', eyes: 'mono', chest: 'star' }),
  robot('iron-titan', '아이언 타이탄', 'epic', world(6), paint('#FF3F3F', '#6A707C', '#FF8A8A', '#14161C', '#3E434C'), { head: 'box', eyes: 'sharp', crest: 'vfin', chest: 'star' }),
  robot('cloud-rider', '클라우드 라이더', 'epic', world(7), paint('#FFD86B', '#F4F8FF', '#6AD0FF', '#2A4A8A'), { ears: 'wing', eyes: 'round', crest: 'propeller', chest: 'star' }),
  robot('jungle-fang', '정글 팽', 'epic', world(8), paint('#FF9F1F', '#2F6B3A', '#FFE14A', '#0C1A0E', '#2E4A30'), { ears: 'cat', eyes: 'sharp', chest: 'bolt', stripe: true }),
  robot('blaze-lord', '블레이즈 로드', 'epic', world(9), paint('#FFE14A', '#C2261A', '#FFFFFF', '#2A0A06', '#5A2A20'), { head: 'box', ears: 'horn', eyes: 'sharp', crest: 'flame' }),
  robot('star-sovereign', '스타 소버린', 'epic', world(10), paint('#FFE680', '#1C1E4A', '#FFE680', '#06071C', '#3A3E7A'), { ears: 'wing', eyes: 'star', crest: 'crown', chest: 'star' }),
  // Attendance gifts at 7, 14 and 28 days.
  robot('daily-fairy', '출석 요정', 'rare', attendance(7), paint('#FF9CC0', '#FFF4F8', '#FF5C9A', '#4A2034'), { ears: 'wing', eyes: 'heart', crest: 'halo', chest: 'heart', cheeks: true }),
  robot('calendar-knight', '캘린더 나이트', 'epic', attendance(14), paint('#5CF2FF', '#3A4A7A', '#9FF0FF', '#0E1430', '#5A6A9A'), { head: 'box', ears: 'antenna', eyes: 'visor', crest: 'crown', chest: 'star' }),
  robot('perfect-king', '개근왕', 'legendary', attendance(28), paint('#FFE14A', '#7A3FD8', '#FFF3A0', '#1E0E3A', '#C08A20'), { ears: 'horn', eyes: 'star', crest: 'crown', chest: 'diamond', stripe: true }),
  // Legendary: long-term coin goals.
  robot('golden', '골든 레전드', 'legendary', coins(25000), paint('#FFFFFF', '#FFC83D', '#FFFFFF', '#5A3A06', '#C08A20'), { ears: 'wing', eyes: 'sharp', crest: 'vfin', chest: 'diamond', stripe: true }),
  robot('prism', '프리즘', 'legendary', coins(40000), paint('#FF5CD6', '#9CF6FF', '#FFFFFF', '#2A1E5A', '#7A88C8'), { ears: 'bunny', eyes: 'heart', crest: 'horn', chest: 'heart', cheeks: true }),
];

export const DEFAULT_CHARACTER = CHARACTERS[0];
export const characterById = (id: string) => CHARACTERS.find((character) => character.id === id);

// Stage that earns a clear or world robot (1-based); coin robots have none.
export const unlockStage = (unlock: Unlock) => unlock.kind === 'clear' ? unlock.stage : unlock.kind === 'world' ? unlock.world * STAGES_PER_WORLD : undefined;

// Robots earned by clearing stages once `unlockedStage` is reached, i.e. every stage before it has
// been cleared. Coin robots are never earned this way.
export function earnedCharacters(unlockedStage: number) {
  return CHARACTERS.filter(({ unlock }) => (unlockStage(unlock) ?? Infinity) < unlockedStage);
}
