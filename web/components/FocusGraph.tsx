'use client';

import * as THREE from 'three';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAtlas } from '../lib/store';
import type { Body } from '../lib/types';

/* Discovery Route + Constellation + Discovery Pulse。
   すべて一時表示・宇宙内の光としてのみ描画 (常時UIなし)。
   - フォーカス時: 航路(上位5本) + 同銀河星座(外周チェーン) + 星座名 + Gem航路先にパルス
   - ホバー0.6秒滞在時: 最上位1本だけを極薄表示
   バッファは固定長を使い回し、毎フレームの生成コストゼロ */

const ROUTE_MAX = 6;
const CONST_MAX = 12;
const PULSE_MAX = 3;

// 航路タイプ別の色 (加算合成なので暗色=薄い光)
const TYPE_COLOR: Record<string, [number, number, number]> = {
  s: [0.45, 0.32, 0.16], // series: 暖色
  d: [0.38, 0.28, 0.16], // developer
  p: [0.30, 0.26, 0.18], // publisher
  t: [0.16, 0.25, 0.36], // tags: 寒色
  g: [0.18, 0.36, 0.28], // hidden gem: 淡緑
};

function labelTexture(text: string) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 80;
  const x = c.getContext('2d')!;
  x.textAlign = 'center';
  x.fillStyle = 'rgba(210, 225, 240, 0.85)';
  x.font = '500 34px -apple-system, "Segoe UI", "Hiragino Sans", sans-serif';
  x.fillText(text, 256, 50);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

function pulseTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(190, 235, 215, 0.9)');
  g.addColorStop(0.4, 'rgba(190, 235, 215, 0.25)');
  g.addColorStop(1, 'rgba(190, 235, 215, 0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const makeLineGeo = (max: number) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 6), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(max * 6), 3));
  g.setDrawRange(0, 0);
  return g;
};
const makeLineMat = () => new THREE.LineBasicMaterial({
  vertexColors: true, transparent: true, opacity: 0,
  blending: THREE.AdditiveBlending, depthWrite: false,
});

export default function FocusGraph() {
  const nameRef = useRef<THREE.Sprite>(null!);
  const pulseRefs = useRef<(THREE.Sprite | null)[]>([]);
  const routeGeo = useMemo(() => makeLineGeo(ROUTE_MAX), []);
  const constGeo = useMemo(() => makeLineGeo(CONST_MAX), []);
  const routeMat = useMemo(makeLineMat, []);
  const constMat = useMemo(makeLineMat, []);
  const pulseTex = useMemo(pulseTexture, []);

  const s = useRef({
    activeId: 0,
    mode: 'none' as 'none' | 'focus' | 'hover',
    opacity: 0,
    hasName: false,
    nameTex: null as THREE.CanvasTexture | null,
    pulses: [] as { p: [number, number, number]; d: number; start: number }[],
  }).current;

  const setSegment = (geo: THREE.BufferGeometry, i: number, a: Body, b: Body,
    col: [number, number, number], k: number) => {
    const p = geo.attributes.position.array as Float32Array;
    const c = geo.attributes.color.array as Float32Array;
    p.set([...a.p, ...b.p], i * 6);
    c.set([col[0] * k, col[1] * k, col[2] * k, col[0] * k, col[1] * k, col[2] * k], i * 6);
  };
  const commit = (geo: THREE.BufferGeometry, n: number) => {
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.setDrawRange(0, n * 2);
  };

  const build = (focus: Body, bodies: Map<number, Body>, mode: 'focus' | 'hover', now: number) => {
    // --- Route ---
    let n = 0;
    const members: Body[] = [];
    s.pulses = [];
    const limit = mode === 'focus' ? 5 : 1;
    for (const [id, score, type] of (focus.nb ?? []).slice(0, limit)) {
      const b = bodies.get(id);
      if (!b || n >= ROUTE_MAX) continue;
      setSegment(routeGeo, n, focus, b, TYPE_COLOR[type] ?? TYPE_COLOR.t,
        0.45 + 0.55 * (score / 100));
      members.push(b);
      if (mode === 'focus' && type === 'g' && s.pulses.length < PULSE_MAX) {
        s.pulses.push({ p: b.p, d: b.d, start: now + 0.7 + s.pulses.length * 0.25 });
      }
      n++;
    }
    commit(routeGeo, n);
    // --- Constellation (フォーカス時のみ / 同銀河 / 3ノード以上) ---
    let cn = 0;
    s.hasName = false;
    if (mode === 'focus') {
      const cm = members.filter((b) => b.gal === focus.gal);
      if (cm.length >= 3) {
        const sorted = cm.slice().sort((a, b) =>
          Math.atan2(a.p[2] - focus.p[2], a.p[0] - focus.p[0])
          - Math.atan2(b.p[2] - focus.p[2], b.p[0] - focus.p[0]));
        for (let i = 0; i < sorted.length && cn < CONST_MAX; i++) {
          setSegment(constGeo, cn, sorted[i], sorted[(i + 1) % sorted.length],
            [0.5, 0.62, 0.8], 0.22);
          cn++;
        }
        // 星座名 = メンバーと共有する最頻タグ
        const count = new Map<string, number>();
        for (const m of sorted) {
          for (const t of m.tg ?? []) {
            if (focus.tg?.includes(t)) count.set(t, (count.get(t) ?? 0) + 1);
          }
        }
        const top = [...count].sort((a, b) => b[1] - a[1])[0];
        if (top && nameRef.current) {
          s.nameTex?.dispose();
          s.nameTex = labelTexture(`${top[0]} Constellation`);
          const m = nameRef.current.material as THREE.SpriteMaterial;
          m.map = s.nameTex;
          m.needsUpdate = true;
          nameRef.current.position.set(
            focus.p[0], focus.p[1] - (focus.d * 2 + 10), focus.p[2]);
          const w = focus.d * 3 + 26;
          nameRef.current.scale.set(w, (w * 80) / 512, 1);
          s.hasName = true;
        }
      }
    }
    commit(constGeo, cn);
  };

  useFrame(({ clock }) => {
    const st = useAtlas.getState();
    const now = clock.elapsedTime;
    const focus = st.focusedId != null ? st.bodies.get(st.focusedId) : null;
    const hover = !focus && st.hoverId != null
      && Date.now() - st.hoverStartedAt > 600
      ? st.bodies.get(st.hoverId) : null;
    const active = focus ?? hover ?? null;
    const mode: 'none' | 'focus' | 'hover' = focus ? 'focus' : hover ? 'hover' : 'none';

    if (active && (active.id !== s.activeId || mode !== s.mode)) {
      s.activeId = active.id;
      s.mode = mode;
      build(active, st.bodies, mode as 'focus' | 'hover', now);
    } else if (!active && s.activeId) {
      s.activeId = 0;
      s.mode = 'none';
      s.pulses = [];
    }

    // フェード包絡線
    const target = active ? 1 : 0;
    s.opacity += (target - s.opacity) * 0.10;
    if (s.opacity < 0.005) s.opacity = 0;
    const cap = s.mode === 'hover' ? 0.15 : 0.34;
    routeMat.opacity = cap * s.opacity;
    constMat.opacity = 0.11 * s.opacity;
    const nm = nameRef.current?.material as THREE.SpriteMaterial | undefined;
    if (nm) nm.opacity = (s.hasName && s.mode === 'focus' ? 0.55 : 0) * s.opacity;

    // Discovery Pulse (Hidden Gem航路先で一度だけ広がる波)
    for (let i = 0; i < PULSE_MAX; i++) {
      const sp = pulseRefs.current[i];
      if (!sp) continue;
      const pu = s.pulses[i];
      const t = pu ? now - pu.start : -1;
      if (pu && t >= 0 && t <= 0.7) {
        sp.visible = true;
        sp.position.set(pu.p[0], pu.p[1], pu.p[2]);
        const k = pu.d * (1.5 + 7 * (t / 0.7));
        sp.scale.set(k, k, 1);
        (sp.material as THREE.SpriteMaterial).opacity = 0.5 * (1 - t / 0.7);
      } else {
        sp.visible = false;
      }
    }
  });

  return (
    <group>
      <lineSegments geometry={routeGeo} material={routeMat} frustumCulled={false} renderOrder={3} />
      <lineSegments geometry={constGeo} material={constMat} frustumCulled={false} renderOrder={3} />
      <sprite ref={nameRef} renderOrder={6}>
        <spriteMaterial transparent depthTest={false} depthWrite={false} opacity={0} />
      </sprite>
      {Array.from({ length: PULSE_MAX }).map((_, i) => (
        <sprite key={i} ref={(el) => { pulseRefs.current[i] = el; }} visible={false} renderOrder={4}>
          <spriteMaterial map={pulseTex} transparent depthWrite={false}
            blending={THREE.AdditiveBlending} opacity={0} />
        </sprite>
      ))}
    </group>
  );
}
