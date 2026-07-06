import { create } from 'zustand';
import type { Body, Universe } from './types';

export type FocusMode = 'none' | 'search' | 'doubleClick';

interface AtlasState {
  universe: Universe | null;
  bodies: Map<number, Body>;
  hoverId: number | null;      // ホバー中 (天体 or ポップアップ上)
  focusedId: number | null;    // 検索/ダブルクリックのフォーカス対象 (照準表示)
  focusMode: FocusMode;
  isCameraLocked: boolean;     // カメラ移動アニメーション中のみtrue
  lastFocusStartedAt: number;
  flyTarget: [number, number, number] | null;
  flyDistance: number;
  legendOpen: boolean;
  mode: 'popularity';          // 将来のモード拡張用 (UIには出さない)
  setUniverse: (u: Universe) => void;
  hoverEnter: (id: number) => void;
  hoverLeave: () => void;
  flyTo: (b: Body, mode: FocusMode) => void;
  arrive: () => void;          // カメラ移動完了 → ロック解除
  clearFocus: () => void;      // ユーザー操作 / Esc / Search空欄で解除
  setLegendOpen: (v: boolean) => void;
}

let graceTimer: ReturnType<typeof setTimeout> | null = null;
let focusTimer: ReturnType<typeof setTimeout> | null = null;

export const useAtlas = create<AtlasState>((set) => ({
  universe: null,
  bodies: new Map(),
  hoverId: null,
  focusedId: null,
  focusMode: 'none',
  isCameraLocked: false,
  lastFocusStartedAt: 0,
  flyTarget: null,
  flyDistance: 40,
  legendOpen: false,
  mode: 'popularity',
  setUniverse: (u) => set({ universe: u, bodies: new Map(u.bodies.map((b) => [b.id, b])) }),
  hoverEnter: (id) => {
    if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
    set({ hoverId: id });
  },
  hoverLeave: () => {
    if (graceTimer) clearTimeout(graceTimer);
    graceTimer = setTimeout(() => set({ hoverId: null }), 250); // 天体→ポップアップ移動の猶予
  },
  flyTo: (b, mode) => {
    if (focusTimer) clearTimeout(focusTimer);
    set({
      flyTarget: b.p, flyDistance: b.d * 8 + 16,
      focusedId: b.id, focusMode: mode,
      isCameraLocked: true, lastFocusStartedAt: Date.now(),
    });
  },
  arrive: () => {
    set({ isCameraLocked: false, flyTarget: null });
    if (focusTimer) clearTimeout(focusTimer);
    // 照準ハイライトは到着後しばらく残してから自動解除
    focusTimer = setTimeout(
      () => set((s) => (s.focusMode !== 'none' ? { focusedId: null, focusMode: 'none' } : {})),
      4000,
    );
  },
  clearFocus: () => {
    if (focusTimer) clearTimeout(focusTimer);
    set({ flyTarget: null, focusedId: null, focusMode: 'none', isCameraLocked: false });
  },
  setLegendOpen: (v) => set({ legendOpen: v }),
}));
