// Explore / Daily Expedition の行き先選定 (意味のある探索のみ、完全ランダムなし)
import type { Body, Universe } from './types';

const rand = <T,>(arr: T[]): T | null =>
  arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;

export const pickHiddenGem = (u: Universe): Body | null =>
  rand(u.bodies.filter((b) => (b.hg ?? 0) >= 60));

export const pickPopularStar = (u: Universe): Body | null =>
  rand(u.bodies.filter((b) => b.ty === 'star').sort((a, b) => b.inf - a.inf).slice(0, 25));

export const pickUnderrated = (u: Universe): Body | null =>
  rand(u.bodies.filter((b) =>
    b.rv && b.rv[1] >= 92 && b.rv[0] >= 300 && (b.ow ?? 0) < 800_000 && b.ty !== 'star'));

export const pickConstellationStar = (u: Universe): Body | null =>
  rand(u.bodies.filter((b) => b.ty === 'star' && (b.nb?.length ?? 0) >= 4));

export interface ExploreAction {
  id: string;
  label: string;   // Exploreメニュー表示
  daily: string;   // Daily Expedition表示
}

export const ACTIONS: ExploreAction[] = [
  { id: 'gem', label: 'Find a hidden gem', daily: 'find a hidden gem' },
  { id: 'constellation', label: 'Open a constellation', daily: 'open a constellation' },
  { id: 'underrated', label: 'Discover an underrated planet', daily: 'discover an underrated planet' },
  { id: 'star', label: 'Visit a popular star', daily: 'visit a popular star' },
  { id: 'galaxy', label: 'Jump to a galaxy', daily: 'travel to a distant galaxy' },
];

// 実行: 対象天体 or 銀河座標とトースト文言を返す
export function runAction(u: Universe, id: string):
  | { body: Body; toast: string }
  | { point: [number, number, number]; dist: number; toast: string }
  | null {
  switch (id) {
    case 'gem': {
      const b = pickHiddenGem(u);
      return b && { body: b, toast: `Hidden gem found — ${b.t}` };
    }
    case 'constellation': {
      const b = pickConstellationStar(u);
      return b && { body: b, toast: `Constellation opened — ${b.t}` };
    }
    case 'underrated': {
      const b = pickUnderrated(u);
      return b && { body: b, toast: `Underrated planet — ${b.t}` };
    }
    case 'star': {
      const b = pickPopularStar(u);
      return b && { body: b, toast: `Popular star — ${b.t}` };
    }
    case 'galaxy': {
      const g = rand(u.galaxies);
      return g && {
        point: g.p, dist: Math.max(g.r * 2.3, 320),
        toast: `${g.name} galaxy`,
      };
    }
    default:
      return null;
  }
}

// Daily Expedition: 日付で決まる今日のテーマ
export function dailyExpedition(): ExploreAction {
  const day = Math.floor(Date.now() / 864e5);
  return ACTIONS[day % ACTIONS.length];
}
