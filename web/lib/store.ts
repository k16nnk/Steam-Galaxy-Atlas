import { create } from 'zustand';
import type { Body, Universe } from './types';

export type FocusMode = 'none' | 'search' | 'doubleClick';
export type UniverseMode = 'explore' | 'popularity' | 'gems' | 'timeline';

export const INITIAL_VIEW: { p: [number, number, number]; dist: number } = {
  p: [0, 0, 0],
  dist: 3050,
};

interface AtlasState {
  universe: Universe | null;
  bodies: Map<number, Body>;
  hoverId: number | null;      // ホバー中 (天体 or ポップアップ上)
  hoverStartedAt: number;      // ホバー滞在時間 (航路のdwell判定用)
  focusedId: number | null;    // 検索/ダブルクリックのフォーカス対象 (照準表示)
  focusMode: FocusMode;
  isCameraLocked: boolean;     // カメラ移動アニメーション中のみtrue
  lastFocusStartedAt: number;
  flyTarget: [number, number, number] | null;
  flyDistance: number;
  legendOpen: boolean;
  idle: boolean;               // 初回操作までの自動回転
  mode: UniverseMode;          // 表示モード (シェーダーで反映)
  drawerId: number | null;     // Game Detail Drawer
  galaxyHoverId: string | null;
  toast: { text: string; id: number } | null;
  resetCount: number;          // Reset Viewの通知 (Search欄クリア等)
  setUniverse: (u: Universe) => void;
  hoverEnter: (id: number) => void;
  hoverLeave: () => void;
  flyTo: (b: Body, mode: FocusMode) => void;
  flyToPoint: (p: [number, number, number], dist: number) => void;
  arrive: () => void;
  clearFocus: () => void;
  setLegendOpen: (v: boolean) => void;
  setIdle: (v: boolean) => void;
  setMode: (m: UniverseMode) => void;
  openDrawer: (id: number) => void;
  closeDrawer: () => void;
  setGalaxyHover: (id: string | null) => void;
  showToast: (text: string) => void;
  resetView: () => void;
}

let graceTimer: ReturnType<typeof setTimeout> | null = null;
let focusTimer: ReturnType<typeof setTimeout> | null = null;
let toastSeq = 1;

export const useAtlas = create<AtlasState>((set) => ({
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
    set({
      flyTarget: b.p, flyDistance: b.d * 8 + 16,
      focusedId: b.id, focusMode: mode,
      isCameraLocked: true, lastFocusStartedAt: Date.now(),
      idle: false,
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
    focusTimer = setTimeout(
      () => set((s) => (s.focusMode !== 'none' ? { focusedId: null, focusMode: 'none' } : {})),
      10000,
    );
  },
  clearFocus: () => {
    if (focusTimer) clearTimeout(focusTimer);
    set({ flyTarget: null, focusedId: null, focusMode: 'none', isCameraLocked: false });
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
      drawerId: null, legendOpen: false, hoverId: null,
      toast: null, resetCount: s.resetCount + 1,
    }));
  },
}));
