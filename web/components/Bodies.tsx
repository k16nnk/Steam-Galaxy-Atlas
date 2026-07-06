'use client';

import * as THREE from 'three';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAtlas } from '../lib/store';
import { view } from '../lib/screenBus';
import type { Body } from '../lib/types';

/* 共通vertexプリアンブル:
   スクリーンスペース最小サイズ — 遠距離でも天体が完全な点にならないよう、
   投影半径が uMinPx [px] を下回る場合だけ拡大する (大小差は維持) */
const minSizeChunk = /* glsl */ `
  uniform float uPx;     // 距離1あたり1pxのワールド長 = tan(fov/2)/(H/2)
  uniform float uMinPx;  // 最小表示半径(px)
  vec4 applyMinSize(vec3 pos, out float f) {
    vec4 cw = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float dCam = distance(cameraPosition, cw.xyz);
    float scaleX = length(instanceMatrix[0].xyz);
    f = max(1.0, (uMinPx * dCam * uPx) / max(scaleX, 1e-4));
    return modelMatrix * instanceMatrix * vec4(pos * f, 1.0);
  }
`;

/* 表示モード (uMode: 0=explore 1=popularity 2=gems 3=timeline) の減光/着色 */
const modeChunk = /* glsl */ `
  attribute float aInf;   // influence 0..1
  attribute float aYear;  // 発売年 0..1 (2004..2026), 不明=-1
  uniform float uMode;
  varying float vDim;
  varying vec3 vTint;
  void applyMode(float gem) {
    vDim = 1.0; vTint = vec3(1.0);
    if (uMode > 0.5 && uMode < 1.5) {           // Popularity
      vDim = mix(0.20, 1.15, pow(aInf, 1.3));
    } else if (uMode > 1.5 && uMode < 2.5) {    // Hidden Gems
      vDim = gem > 0.01 ? 1.3 : 0.14;
    } else if (uMode > 2.5) {                   // Timeline
      if (aYear >= 0.0) vTint = mix(vec3(1.22, 0.84, 0.52), vec3(0.62, 0.94, 1.30), aYear);
      else { vDim = 0.28; vTint = vec3(0.85); }
    }
  }
`;

/* 惑星・衛星・小惑星: 所属恒星の方向から照らされる疑似ライティング (Lambert + rim) */
const litVertex = /* glsl */ `
  attribute vec3 aColor;
  attribute vec3 aLightDir;
  attribute float aLum;
  attribute vec2 aGem;   // [強度, 位相] Hidden Gemの呼吸明滅
  uniform float uTime;
  varying vec3 vColor;
  varying vec3 vLightDir;
  varying float vLum;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vBreath;
  ${minSizeChunk}
  ${modeChunk}
  void main() {
    vColor = aColor; vLightDir = aLightDir; vLum = aLum;
    float f;
    vec4 wp = applyMinSize(position, f);
    vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vViewDir = normalize(cameraPosition - wp.xyz);
    // Gemの呼吸: ゆっくり(±13%まで)、遠距離ではフェードアウト (点滅ノイズ化を防ぐ)
    float dB = distance(cameraPosition, (modelMatrix * instanceMatrix * vec4(0.,0.,0.,1.)).xyz);
    vBreath = 1.0 + aGem.x * 0.13 * sin(uTime * 0.85 + aGem.y)
      * (1.0 - smoothstep(500.0, 1200.0, dB));
    applyMode(aGem.x);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const litFragment = /* glsl */ `
  varying vec3 vColor;
  varying vec3 vLightDir;
  varying float vLum;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vBreath;
  varying float vDim;
  varying vec3 vTint;
  void main() {
    vec3 n = normalize(vNormal);
    float diff = max(dot(n, normalize(vLightDir)), 0.0);
    float rim = pow(1.0 - max(dot(n, normalize(vViewDir)), 0.0), 3.0) * 0.15;
    float albedo = 0.7 + 0.3 * vLum;
    vec3 col = (vColor * (0.07 + 0.93 * diff * albedo) + vColor * rim) * vBreath;
    gl_FragColor = vec4(col * vDim * vTint, 1.0);
  }
`;

/* 恒星: 自発光。luminosityで発光強度、縁をわずかに減光 (Bloom閾値超えで控えめに光る) */
const starVertex = /* glsl */ `
  attribute vec3 aColor;
  attribute float aLum;
  attribute vec2 aGem;
  varying vec3 vColor;
  varying float vLum;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  ${minSizeChunk}
  ${modeChunk}
  void main() {
    vColor = aColor; vLum = aLum;
    float f;
    vec4 wp = applyMinSize(position, f);
    vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vViewDir = normalize(cameraPosition - wp.xyz);
    applyMode(aGem.x);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const starFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vLum;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vDim;
  varying vec3 vTint;
  void main() {
    vec3 n = normalize(vNormal);
    float fres = pow(max(dot(n, normalize(vViewDir)), 0.0), 0.6);
    vec3 col = vColor * (0.75 + 0.9 * vLum) * (0.78 + 0.22 * fres);
    gl_FragColor = vec4(col * vDim * vTint, 1.0);
  }
`;

type Kind = 'star' | 'lit' | 'asteroid';
const MIN_PX = { star: 2.6, lit: 1.4, asteroid: 1.0 }; // 最小表示半径(px) — 大小差は維持
const MIN_PICK_PX = 9; // ホバー判定の最小半径(px) — 視覚サイズと分離

/* カスタムraycast: 実メッシュではなく「拡大した当たり判定球」で判定。
   pick半径 = max(実半径*1.3, スクリーン9px相当) → 小惑星でもホバー可能 */
function makeRaycast(bodies: Body[]) {
  return function raycast(
    this: THREE.InstancedMesh,
    raycaster: THREE.Raycaster,
    intersects: THREE.Intersection[],
  ) {
    const ray = raycaster.ray;
    const o = ray.origin, dir = ray.direction;
    let bestI = -1, bestT = Infinity;
    for (let i = 0; i < bodies.length; i++) {
      const p = bodies[i].p;
      const dx = p[0] - o.x, dy = p[1] - o.y, dz = p[2] - o.z;
      const t = dx * dir.x + dy * dir.y + dz * dir.z; // 光線上の最近接位置
      if (t < 0 || t >= bestT) continue;
      const ex = dx - dir.x * t, ey = dy - dir.y * t, ez = dz - dir.z * t;
      const d2 = ex * ex + ey * ey + ez * ez;
      const pick = Math.max(bodies[i].d * 0.65, t * view.pxFactor * MIN_PICK_PX);
      if (d2 <= pick * pick) { bestI = i; bestT = t; }
    }
    if (bestI >= 0) {
      intersects.push({
        distance: bestT,
        point: ray.at(bestT, new THREE.Vector3()),
        object: this,
        instanceId: bestI,
      } as unknown as THREE.Intersection);
    }
  };
}

function BodyMesh({ bodies, kind }: { bodies: Body[]; kind: Kind }) {
  const ref = useRef<THREE.InstancedMesh>(null!);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: kind === 'star' ? starVertex : litVertex,
        fragmentShader: kind === 'star' ? starFragment : litFragment,
        uniforms: {
          uPx: { value: 0.002 },
          uMinPx: { value: MIN_PX[kind] },
          uTime: { value: 0 },
          uMode: { value: 0 },
        },
      }),
    [kind],
  );

  useFrame(({ camera, size, clock }) => {
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 55;
    const px = Math.tan(THREE.MathUtils.degToRad(fov) / 2) / (size.height / 2);
    material.uniforms.uPx.value = px;
    material.uniforms.uTime.value = clock.elapsedTime;
    const m = useAtlas.getState().mode;
    material.uniforms.uMode.value =
      m === 'popularity' ? 1 : m === 'gems' ? 2 : m === 'timeline' ? 3 : 0;
    view.pxFactor = px;
  });

  const attrs = useMemo(() => {
    const n = bodies.length;
    const color = new Float32Array(n * 3);
    const light = new Float32Array(n * 3);
    const lum = new Float32Array(n);
    const gem = new Float32Array(n * 2);
    const inf = new Float32Array(n);
    const year = new Float32Array(n);
    const c = new THREE.Color();
    bodies.forEach((b, i) => {
      c.set(b.c);
      color[i * 3] = c.r; color[i * 3 + 1] = c.g; color[i * 3 + 2] = c.b;
      const ld = b.ld ?? [0, 1, 0];
      light[i * 3] = ld[0]; light[i * 3 + 1] = ld[1]; light[i * 3 + 2] = ld[2];
      lum[i] = b.lum;
      const hg = b.hg ?? 0;
      gem[i * 2] = hg >= 60 ? 0.5 + 0.5 * Math.min(1, (hg - 60) / 25) : 0;
      gem[i * 2 + 1] = (b.id % 628) / 100; // 位相 (0..2π)
      inf[i] = Math.min(1, b.inf / 100);
      const y = b.rel ? parseInt(b.rel.slice(0, 4), 10) : NaN;
      year[i] = Number.isFinite(y) ? Math.min(1, Math.max(0, (y - 2004) / 22)) : -1;
    });
    return { color, light, lum, gem, inf, year };
  }, [bodies]);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const pos = new THREE.Vector3();
    bodies.forEach((b, i) => {
      pos.set(b.p[0], b.p[1], b.p[2]);
      const r = b.d / 2;
      if (kind === 'asteroid') {
        const h = (b.id * 2654435761) >>> 0;
        e.set((h & 255) / 40, ((h >> 8) & 255) / 40, ((h >> 16) & 255) / 40);
        q.setFromEuler(e);
        s.set(r, r * 0.72, r * 0.88);
      } else {
        q.identity();
        s.set(r, r, r);
      }
      m.compose(pos, q, s);
      ref.current.setMatrixAt(i, m);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
    ref.current.raycast = makeRaycast(bodies); // 当たり判定を拡大球に差し替え
    ref.current.frustumCulled = false; // 最小サイズ拡大分があるためカリングは無効化
  }, [bodies, kind]);

  if (!bodies.length) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, bodies.length]}
      material={material}
      onPointerMove={(ev) => {
        ev.stopPropagation();
        const b = bodies[ev.instanceId!];
        if (b && useAtlas.getState().hoverId !== b.id) useAtlas.getState().hoverEnter(b.id);
      }}
      onPointerOut={() => useAtlas.getState().hoverLeave()}
      onDoubleClick={(ev) => {
        ev.stopPropagation();
        const b = bodies[ev.instanceId!];
        if (b) useAtlas.getState().flyTo(b, 'doubleClick');
      }}
      onClick={(ev) => {
        if (ev.delta > 3) return; // ドラッグ後のクリックは無視
        ev.stopPropagation();
        const b = bodies[ev.instanceId!];
        if (b) useAtlas.getState().openDrawer(b.id); // シングルクリック = 詳細ドロワー
      }}
    >
      {kind === 'asteroid' ? (
        <icosahedronGeometry args={[1, 0]}>
          <instancedBufferAttribute attach="attributes-aColor" args={[attrs.color, 3]} />
          <instancedBufferAttribute attach="attributes-aLightDir" args={[attrs.light, 3]} />
          <instancedBufferAttribute attach="attributes-aLum" args={[attrs.lum, 1]} />
          <instancedBufferAttribute attach="attributes-aGem" args={[attrs.gem, 2]} />
          <instancedBufferAttribute attach="attributes-aInf" args={[attrs.inf, 1]} />
          <instancedBufferAttribute attach="attributes-aYear" args={[attrs.year, 1]} />
        </icosahedronGeometry>
      ) : (
        <sphereGeometry args={[1, kind === 'star' ? 32 : 24, kind === 'star' ? 32 : 24]}>
          <instancedBufferAttribute attach="attributes-aColor" args={[attrs.color, 3]} />
          <instancedBufferAttribute attach="attributes-aLightDir" args={[attrs.light, 3]} />
          <instancedBufferAttribute attach="attributes-aLum" args={[attrs.lum, 1]} />
          <instancedBufferAttribute attach="attributes-aGem" args={[attrs.gem, 2]} />
          <instancedBufferAttribute attach="attributes-aInf" args={[attrs.inf, 1]} />
          <instancedBufferAttribute attach="attributes-aYear" args={[attrs.year, 1]} />
        </sphereGeometry>
      )}
    </instancedMesh>
  );
}

export default function Bodies() {
  const universe = useAtlas((s) => s.universe);
  const groups = useMemo(() => {
    if (!universe) return null;
    const stars: Body[] = [], lit: Body[] = [], asts: Body[] = [];
    for (const b of universe.bodies) {
      if (b.ty === 'star') stars.push(b);
      else if (b.ty === 'asteroid') asts.push(b);
      else lit.push(b);
    }
    return { stars, lit, asts };
  }, [universe]);
  if (!groups) return null;
  return (
    <group>
      <BodyMesh key={`s${groups.stars.length}`} bodies={groups.stars} kind="star" />
      <BodyMesh key={`l${groups.lit.length}`} bodies={groups.lit} kind="lit" />
      <BodyMesh key={`a${groups.asts.length}`} bodies={groups.asts} kind="asteroid" />
    </group>
  );
}
