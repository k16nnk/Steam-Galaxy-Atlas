'use client';

import * as THREE from 'three';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAtlas } from '../lib/store';
import type { Galaxy } from '../lib/types';

/* 銀河名 + 代表タグの控えめなビルボードラベル。
   カメラが銀河半径の~1.5倍より離れたときだけフェードイン。
   ホバーでGalaxy Summary(右下)、クリックでその銀河へ飛行。
   フェード中はraycastを無効化し、天体ホバーを妨げない。 */

const noopRaycast = () => {};

function makeTexture(name: string, tags: string[]) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const x = c.getContext('2d')!;
  x.textAlign = 'center';
  x.fillStyle = 'rgba(230,240,250,0.92)';
  x.font = '600 88px -apple-system, "Segoe UI", "Hiragino Sans", sans-serif';
  x.fillText(name, 512, 116);
  if (tags.length) {
    x.fillStyle = 'rgba(195,212,232,0.52)';
    x.font = '400 42px -apple-system, "Segoe UI", "Hiragino Sans", sans-serif';
    x.fillText(tags.join('  /  '), 512, 194);
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

function Label({ g }: { g: Galaxy }) {
  const mat = useRef<THREE.SpriteMaterial>(null!);
  const spr = useRef<THREE.Sprite>(null!);
  const tex = useMemo(() => makeTexture(g.name, g.tags.slice(0, 3)), [g]);
  const center = useMemo(() => new THREE.Vector3(...g.p), [g]);
  useFrame(({ camera }) => {
    const d = camera.position.distanceTo(center);
    const t = THREE.MathUtils.clamp((d / Math.max(g.r, 80) - 1.5) / 1.0, 0, 1);
    if (mat.current) {
      const hovered = useAtlas.getState().galaxyHoverId === g.id;
      mat.current.opacity = t * (hovered ? 1.0 : 0.8);
    }
    if (spr.current) {
      spr.current.raycast = t > 0.35 ? THREE.Sprite.prototype.raycast : noopRaycast;
    }
  });
  const w = Math.max(g.r * 0.9, 160);
  return (
    <sprite
      ref={spr}
      position={[g.p[0], g.p[1] + g.r * 0.55, g.p[2]]}
      scale={[w, w / 4, 1]}
      renderOrder={5}
      onPointerOver={(e) => { e.stopPropagation(); useAtlas.getState().setGalaxyHover(g.id); }}
      onPointerOut={() => useAtlas.getState().setGalaxyHover(null)}
      onClick={(e) => {
        if (e.delta > 3) return;
        e.stopPropagation();
        const st = useAtlas.getState();
        st.flyToPoint(g.p, Math.max(g.r * 2.3, 320));
        st.showToast(`${g.name} galaxy`);
      }}
    >
      <spriteMaterial ref={mat} map={tex} transparent depthTest={false} depthWrite={false} opacity={0} />
    </sprite>
  );
}

export default function GalaxyLabels() {
  const universe = useAtlas((s) => s.universe);
  if (!universe) return null;
  return (
    <>
      {universe.galaxies.map((g) => (
        <Label key={g.id} g={g} />
      ))}
    </>
  );
}
