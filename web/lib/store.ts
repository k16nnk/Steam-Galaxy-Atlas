import { create } from 'zustand';
import type { Body, Universe } from './types';

export type FocusMode = 'none' | 'search' | 'doubleClick';
export type UniverseMode = 'explore' | 'popularity' | 'gems' | 'timeline' | 'mine';

export const INITIAL_VIEW: { p: [number, number, number]; dist: number } = {
  p: [0, 0, 0],
  dist: 3050,
};

const LS = {
  favs: 'sga_favs',
  history: 'sga_history',
  owned: 'sga_owned',
};

export interface HistoryEntry { id: number; t: string; ts: number }

interface AtlasState {
  universe: Universe | null;
  bodies: Map<number, Body>;
  hoverId: number | null;
  hoverStartedAt: number;
  focusedId: number | null;    // 照準表示 (一時的)
  focusMode: FocusMode;
  isCameraLocked: boolean;
  lastFocusStartedAt: number;
  flyTarget: [number, number, number] | null;
  flyDistance: number;
  legendOpen: boolean;
  idle: boolean;               // 自動回転 (ズーム or 飛行で停止。ドラッグでは止めない)
  mode: UniverseMode;
  drawerId: number | null;
  galaxyHoverId: string | null;
  toast: { text: string; id: number } | null;
  resetCount: number;
  started: boolean;            // スタート画面を抜けたか
  myOpen: boolean;             // My Universeシーン
  // Journey (Reset/Escまで永続)
  route: { sourceId: number; ids: number[] } | null;
  visited: number[];           // セッション内の訪問順 (トレイル線)
  favorites: number[];         // ★お気に入り (localStorage)
  owned: Record<number, number> | null; // appid→プレイ分 (localStorage, サーバー保存なし)
  ownedId: string | null;      // 取込元SteamID表示用
  stateVersion: number;        // aState属性の更新通知
  setUniverse: (u: Universe) => void;
  hoverEnter: (id: number) => void;
  hoverLeave: () => void;
  flyTo: (b: Body, mode: FocusMode) => void;
  flyToPoint: (p: [number, number, number], dist: number) => void;
  arrive: () => void;
  clearFocus: () => void;      // カメラ操作時: 照準のみ解除 (航路は残す)
  clearJourney: () => void;    // Esc: 航路・発光・照準・ドロワーを消す
  setLegendOpen: (v: boolean) => void;
  setIdle: (v: boolean) => void;
  setMode: (m: UniverseMode) => void;
  openDrawer: (id: number) => void;
  closeDrawer: () => void;
  setGalaxyHover: (id: string | null) => void;
  showToast: (text: string) => void;
  resetView: () => void;
  setStarted: () => void;
  setMyOpen: (v: boolean) => void;
  toggleFavorite: (id: number) => void;
  setOwned: (steamid: string, games: Record<number, number>) => void;
  loadPersisted: () => void;
  getHistory: () => HistoryEntry[];
}

let graceTimer: ReturnType<typeof setTimeout> | null = null;
let focusTimer: ReturnType<typeof setTimeout> | null = null;
let toastSeq = 1;

const saveJson = (k: string, v: unknown) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ }
};
const loadJson = <T,>(k: string): T | null => {
  try { const s = localStorage.getItem(k); return s ? (JSON.parse(s) as T) : null; } catch { return null; }
};

export const useAtlas = create<AtlasState>((set, get) => ({
  universe: null,
  bodies: new Map(),
  hoverId: null,
  hoverStartedAt: 0,
  focusedId: null,
  focusMode: 'none',
  isCameraLocked: false,
  lastFocusStartedAt: 0,
  flyTarget: null,
  flyDistance: 40,
  legendOpen: false,
  idle: true,
  mode: 'explore',
  drawerId: null,
  galaxyHoverId: null,
  toast: null,
  resetCount: 0,
  started: false,
  myOpen: false,
  route: null,
  visited: [],
  favorites: [],
  owned: null,
  ownedId: null,
  stateVersion: 0,
  setUniverse: (u) => set({ universe: u, bodies: new Map(u.bodies.map((b) => [b.id, b])) }),
  hoverEnter: (id) => {
    if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
    set((s) => (s.hoverId === id ? { hoverId: id }
      : { hoverId: id, hoverStartedAt: Date.now() }));
  },
  hoverLeave: () => {
    if (graceTimer) clearTimeout(graceTimer);
    graceTimer = setTimeout(() => set({ hoverId: null }), 250);
  },
  flyTo: (b, mode) => {
    if (focusTimer) clearTimeout(focusTimer);
    set((s) => {
      // 訪問トレイル (連続重複は追加しない)
      const visited = s.visited[s.visited.length - 1] === b.id
        ? s.visited : [...s.visited, b.id].slice(-64);
      // 訪問履歴 (localStorage, My Universe用)
      const hist = (loadJson<HistoryEntry[]>(LS.history) ?? [])
        .filter((h) => h.id !== b.id);
      hist.unshift({ id: b.id, t: b.t, ts: Date.now() });
      saveJson(LS.history, hist.slice(0, 60));
      return {
        flyTarget: b.p, flyDistance: b.d * 8 + 16,
        focusedId: b.id, focusMode: mode,
        isCameraLocked: true, lastFocusStartedAt: Date.now(),
        idle: false,
        route: b.nb?.length ? { sourceId: b.id, ids: b.nb.map(([id]) => id) } : s.route,
        visited,
        stateVersion: s.stateVersion + 1,
      };
    });
  },
  flyToPoint: (p, dist) => {
    if (focusTimer) clearTimeout(focusTimer);
    set({
      flyTarget: p, flyDistance: dist,
      focusedId: null, focusMode: 'none',
      isCameraLocked: true, idle: false,
    });
  },
  arrive: () => {
    set({ isCameraLocked: false, flyTarget: null });
    if (focusTimer) clearTimeout(focusTimer);
    // 照準のみ時間経過でフェード (航路・発光は残す)
    focusTimer = setTimeout(
      () => set((s) => (s.focusMode !== 'none' ? { focusedId: null, focusMode: 'none' } : {})),
      10000,
    );
  },
  clearFocus: () => {
    if (focusTimer) clearTimeout(focusTimer);
    set({ flyTarget: null, focusedId: null, focusMode: 'none', isCameraLocked: false });
  },
  clearJourney: () => {
    if (focusTimer) clearTimeout(focusTimer);
    set((s) => ({
      flyTarget: null, focusedId: null, focusMode: 'none', isCameraLocked: false,
      route: null, visited: [], drawerId: null,
      stateVersion: s.stateVersion + 1,
    }));
  },
  setLegendOpen: (v) => set({ legendOpen: v }),
  setIdle: (v) => set({ idle: v }),
  setMode: (m) => set({ mode: m }),
  openDrawer: (id) => set({ drawerId: id }),
  closeDrawer: () => set({ drawerId: null }),
  setGalaxyHover: (id) => set({ galaxyHoverId: id }),
  showToast: (text) => set({ toast: { text, id: toastSeq++ } }),
  resetView: () => {
    if (focusTimer) clearTimeout(focusTimer);
    set((s) => ({
      flyTarget: INITIAL_VIEW.p, flyDistance: INITIAL_VIEW.dist,
      focusedId: null, focusMode: 'none', isCameraLocked: true,
      drawerId: null, legendOpen: false, hoverId: null, myOpen: false,
      route: null, visited: [],
      toast: null, resetCount: s.resetCount + 1,
      stateVersion: s.stateVersion + 1,
      idle: true, // 初期ビューに戻ったら再びゆっくり回る
    }));
  },
  setStarted: () => set({ started: true }),
  setMyOpen: (v) => set({ myOpen: v }),
  toggleFavorite: (id) => set((s) => {
    const favorites = s.favorites.includes(id)
      ? s.favorites.filter((x) => x !== id)
      : [...s.favorites, id];
    saveJson(LS.favs, favorites);
    return { favorites, stateVersion: s.stateVersion + 1 };
  }),
  setOwned: (steamid, games) => set((s) => {
    saveJson(LS.owned, { steamid, games, ts: Date.now() });
    return { owned: games, ownedId: steamid, stateVersion: s.stateVersion + 1 };
  }),
  loadPersisted: () => set((s) => {
    const favorites = loadJson<number[]>(LS.favs) ?? [];
    const owned = loadJson<{ steamid: string; games: Record<number, number> }>(LS.owned);
    return {
      favorites,
      owned: owned?.games ?? null,
      ownedId: owned?.steamid ?? null,
      stateVersion: s.stateVersion + 1,
    };
  }),
  getHistory: () => loadJson<HistoryEntry[]>(LS.history) ?? [],
}));
