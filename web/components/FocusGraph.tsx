'use client';

import * as THREE from 'three';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAtlas } from '../lib/store';
import type { Body } from '../lib/types';

/* Discovery Route + Constellation + 訪問トレイル + Discovery Pulse。
   航路・星座・トレイルは store.route / store.visited 駆動で
   Reset または Esc まで消えない (カメラ操作では消えない)。
   ホバー0.6秒滞在時は、航路未表示のときだけ最上位1本を極薄プレビュー。 */

const ROUTE_MAX = 6;
const CONST_MAX = 12;
const TRAIL_MAX = 64;
const PULSE_MAX = 3;

const TYPE_COLOR: Record<string, [number, number, number]> = {
  s: [0.45, 0.32, 0.16],
  d: [0.38, 0.28, 0.16],
  p: [0.30, 0.26, 0.18],
  t: [0.16, 0.25, 0.36],
  g: [0.18, 0.36, 0.28],
};
const TRAIL_COLOR: [number, number, number] = [0.45, 0.36, 0.18]; // 旅の軌跡: 金

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
  const trailGeo = useMemo(() => makeLineGeo(TRAIL_MAX), []);
  const routeMat = useMemo(makeLineMat, []);
  const constMat = useMemo(makeLineMat, []);
  const trailMat = useMemo(makeLineMat, []);
  const pulseTex = useMemo(pulseTexture, []);

  const s = useRef({
    routeSource: 0,       // 表示中の航路の起点 (0=なし)
    hoverPreview: 0,
    trailLen: 0,
    opacity: 0,           // 航路+星座の包絡線
    hoverOpacity: 0,
    hasName: false,
    nameTex: null as THREE.CanvasTexture | null,
    pulses: [] as { p: [number, number, number]; d: number; start: number }[],
  }).current;

  const setSegment = (geo: THREE.BufferGeometry, i: number, a: [number, number, number],
    b: [number, number, number], col: [number, number, number], k: number) => {
    const p = geo.attributes.position.array as Float32Array;
    const c = geo.attributes.color.array as Float32Array;
    p.set([...a, ...b], i * 6);
    c.set([col[0] * k, col[1] * k, col[2] * k, col[0] * k, col[1] * k, col[2] * k], i * 6);
  };
  const commit = (geo: THREE.BufferGeometry, n: number) => {
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.setDrawRange(0, n * 2);
  };

  const buildRoute = (focus: Body, bodies: Map<number, Body>, withPulse: boolean, now: number) => {
    let n = 0;
    const members: Body[] = [];
    s.pulses = [];
    for (const [id, score, type] of (focus.nb ?? []).slice(0, 5)) {
      const b = bodies.get(id);
      if (!b || n >= ROUTE_MAX) continue;
      setSegment(routeGeo, n, focus.p, b.p, TYPE_COLOR[type] ?? TYPE_COLOR.t,
        0.45 + 0.55 * (score / 100));
      members.push(b);
      if (withPulse && type === 'g' && s.pulses.length < PULSE_MAX) {
        s.pulses.push({ p: b.p, d: b.d, start: now + 0.7 + s.pulses.length * 0.25 });
      }
      n++;
    }
    commit(routeGeo, n);
    // 星座 (同銀河・3ノード以上)
    let cn = 0;
    s.hasName = false;
    const cm = members.filter((b) => b.gal === focus.gal);
    if (withPulse && cm.length >= 3) {
      const sorted = cm.slice().sort((a, b) =>
        Math.atan2(a.p[2] - focus.p[2], a.p[0] - focus.p[0])
        - Math.atan2(b.p[2] - focus.p[2], b.p[0] - focus.p[0]));
      for (let i = 0; i < sorted.length && cn < CONST_MAX; i++) {
        setSegment(constGeo, cn, sorted[i].p, sorted[(i + 1) % sorted.length].p,
          [0.5, 0.62, 0.8], 0.22);
        cn++;
      }
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
        nameRef.current.position.set(focus.p[0], focus.p[1] - (focus.d * 2 + 10), focus.p[2]);
        const w = focus.d * 3 + 26;
        nameRef.current.scale.set(w, (w * 80) / 512, 1);
        s.hasName = true;
      }
    }
    commit(constGeo, cn);
  };

  const buildTrail = (visited: number[], bodies: Map<number, Body>) => {
    let n = 0;
    for (let i = 0; i + 1 < visited.length && n < TRAIL_MAX; i++) {
      const a = bodies.get(visited[i]);
      const b = bodies.get(visited[i + 1]);
      if (!a || !b) continue;
      setSegment(trailGeo, n, a.p, b.p, TRAIL_COLOR, 1);
      n++;
    }
    commit(trailGeo, n);
  };

  useFrame(({ clock }) => {
    const st = useAtlas.getState();
    const now = clock.elapsedTime;

    // --- 永続航路 (store.route駆動、Reset/Escまで残る) ---
    const routeSource = st.route?.sourceId ?? 0;
    if (routeSource !== s.routeSource) {
      s.routeSource = routeSource;
      const focus = routeSource ? st.bodies.get(routeSource) : null;
      if (focus) buildRoute(focus, st.bodies, true, now);
      else { commit(routeGeo, 0); commit(constGeo, 0); s.hasName = false; s.pulses = []; }
    }
    // --- ホバープレビュー (航路が無いときのみ・最上位1本) ---
    const hover = !routeSource && st.hoverId != null
      && Date.now() - st.hoverStartedAt > 600 ? st.bodies.get(st.hoverId) : null;
    if (hover && hover.id !== s.hoverPreview) {
      s.hoverPreview = hover.id;
      buildRoute(hover, st.bodies, false, now);
    } else if (!hover && !routeSource && s.hoverPreview) {
      s.hoverPreview = 0;
      commit(routeGeo, 0);
      commit(constGeo, 0);
    }
    // --- 訪問トレイル ---
    if (st.visited.length !== s.trailLen) {
      s.trailLen = st.visited.length;
      buildTrail(st.visited, st.bodies);
    }

    // 包絡線 (表示対象があれば1へ、なければ0へ)
    const routeTarget = routeSource ? 1 : hover ? 1 : 0;
    s.opacity += (routeTarget - s.opacity) * 0.10;
    if (s.opacity < 0.005) s.opacity = 0;
    const cap = routeSource ? 0.34 : 0.15;
    routeMat.opacity = cap * s.opacity;
    constMat.opacity = (routeSource ? 0.11 : 0) * s.opacity;
    trailMat.opacity = s.trailLen > 1 ? 0.16 : 0;
    const nm = nameRef.current?.material as THREE.SpriteMaterial | undefined;
    if (nm) nm.opacity = (s.hasName && routeSource ? 0.55 : 0) * s.opacity;

    // Discovery Pulse
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
      <lineSegments geometry={trailGeo} material={trailMat} frustumCulled={false} renderOrder={3} />
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
