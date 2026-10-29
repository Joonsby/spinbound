// Stage looks. Stage data keeps its numeric `theme` (also used for music); this maps it to visuals.

export type ThemeId = 'meadow' | 'forest' | 'volcano';

export type StageTheme = {
  id: ThemeId;
  accent: string;
  sky: [top: string, middle: string, horizon: string];
  sun: { color: string; glow: string; x: number; y: number; radius: number };
  cloud: { light: string; shade: string };
  far: { light: string; base: string; dark: string; cap: string; water: string };
  mid: { rock: [string, string, string]; cap: [string, string]; tree: [string, string]; ruin: [string, string] };
  near: { light: string; base: string; dark: string; bush: [string, string] };
  foreground: [string, string];
  grass: [light: string, base: string, dark: string];
  soil: [light: string, base: string, dark: string];
  stone: [light: string, base: string];
  ledge: [light: string, base: string, dark: string];
  ledgeTop: [string, string];
  flowers: string[];
  ambient: { kind: 'pollen' | 'firefly' | 'ember'; color: number };
  glow?: string;
};

const MEADOW: StageTheme = {
  id: 'meadow',
  accent: '#FFB547',
  sky: ['#3FA9F0', '#7CC8F5', '#D9F2FF'],
  sun: { color: '#FFF7DA', glow: 'rgba(255,238,186,0.55)', x: 0.2, y: 118, radius: 40 },
  cloud: { light: '#FFFFFF', shade: '#D9E6F6' },
  far: { light: '#C3D9E8', base: '#9DBBD0', dark: '#86A7BF', cap: '#AFD3A6', water: '#EAF8FF' },
  mid: { rock: ['#D2BC9C', '#B59C7E', '#8E7660'], cap: ['#A4D97E', '#78BB5E'], tree: ['#6CBB60', '#43914F'], ruin: ['#C4BFB3', '#958F84'] },
  near: { light: '#86CD6E', base: '#5DAE58', dark: '#3F8C45', bush: ['#79C468', '#4E9E4E'] },
  foreground: ['#3E8E3E', '#2C6B33'],
  grass: ['#B4E874', '#6CC44A', '#3E8E3A'],
  soil: ['#A87452', '#8B5A3C', '#6A422C'],
  stone: ['#C7A684', '#9A7A5E'],
  ledge: ['#D3CDBF', '#A9A296', '#7A7368'],
  ledgeTop: ['#9ED47A', '#6DB55A'],
  flowers: ['#FFD24A', '#FFFFFF', '#FF8FB1', '#9FD8FF'],
  ambient: { kind: 'pollen', color: 0xfff6c4 },
};

const FOREST: StageTheme = {
  id: 'forest',
  accent: '#A5E5C6',
  sky: ['#4E9E92', '#8CCBB6', '#E2F4DA'],
  sun: { color: '#FFF8DC', glow: 'rgba(255,246,206,0.45)', x: 0.74, y: 92, radius: 30 },
  cloud: { light: '#EDF8EF', shade: '#CFE5D6' },
  far: { light: '#9CC4B2', base: '#77A693', dark: '#5F8E7C', cap: '#8DBB8E', water: '#E6F7EF' },
  mid: { rock: ['#9C7A60', '#7A5A44', '#58402F'], cap: ['#7FC172', '#52985A'], tree: ['#5FAE66', '#3C7F4C'], ruin: ['#A9A69A', '#7C796E'] },
  near: { light: '#5FA866', base: '#3F7D4E', dark: '#2D5E3B', bush: ['#5BA460', '#367346'] },
  foreground: ['#2E6B3E', '#1F4E2D'],
  grass: ['#A6E08A', '#5DB06A', '#3A7F4B'],
  soil: ['#8A6248', '#6A4A36', '#4E3526'],
  stone: ['#9E8670', '#73604F'],
  ledge: ['#D9A066', '#A86F42', '#6E4526'],
  ledgeTop: ['#93D27D', '#5FA866'],
  flowers: ['#F6FF9A', '#FFFFFF', '#B9F27A'],
  ambient: { kind: 'firefly', color: 0xf6ff9a },
};

const VOLCANO: StageTheme = {
  id: 'volcano',
  accent: '#FFBE89',
  sky: ['#24172C', '#57283A', '#C9563F'],
  sun: { color: '#FFB07A', glow: 'rgba(255,120,80,0.45)', x: 0.78, y: 140, radius: 52 },
  cloud: { light: '#6E525C', shade: '#4A3540' },
  far: { light: '#6A3E4E', base: '#4B2E3E', dark: '#3A2230', cap: '#7E4A4E', water: '#FF8A4A' },
  mid: { rock: ['#7A5660', '#5A3A44', '#3E2830'], cap: ['#9A6A62', '#74505A'], tree: ['#5E4048', '#40282E'], ruin: ['#7C6A70', '#58484E'] },
  near: { light: '#62424A', base: '#4A3038', dark: '#33202A', bush: ['#6E4A50', '#4A3038'] },
  foreground: ['#33202A', '#22141C'],
  grass: ['#B07A6E', '#7E5250', '#4E3236'],
  soil: ['#6A4A4A', '#523638', '#3A2428'],
  stone: ['#8A6A68', '#5E4446'],
  ledge: ['#9A8A90', '#6E5E66', '#4A3E46'],
  ledgeTop: ['#B88070', '#8A5A52'],
  flowers: ['#FFB46A', '#FF7A3A'],
  ambient: { kind: 'ember', color: 0xffb46a },
  glow: '#FF7A3A',
};

const BY_INDEX = [MEADOW, FOREST, VOLCANO];

export function themeForStage(theme: number) { return BY_INDEX[theme] ?? MEADOW; }
