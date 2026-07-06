'use client';

import * as THREE from 'three';
import { useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import Bodies from './Bodies';
import GalaxyLabels from './GalaxyLabels';
import { useAtlas } from '../lib/store';
import { screen, view } from '../lib/screenBus';

/* 検索/ダブルクリック時のカメラ移動。
   ユーザー操作 (ドラッグ/ホイール/パン) が入った瞬間にフォーカス解除 → 永久固定を防ぐ */
function CameraRig() {
  const { camera, controls } = useThree();
  useEffect(() => {
    if (!controls) return;
    const ctl = controls as unknown as {
      addEventListener: (e: string, f: () => void) => void;
      removeEventListener: (e: string, f: () => void) => void;
    };
    const onStart = () => {
      const st = useAtlas.getState();
      if (st.idle) st.setIdle(false); // 初回操作で自動回転を停止
      if (st.flyTarget || st.focusMode !== 'none') st.clearFocus();
    };
    ctl.addEventListener('start', onStart);
    return () => ctl.removeEventListener('start', onStart);
  }, [controls]);
  useFrame((_, dt) => {
    const st = useAtlas.getState();
    if (!st.flyTarget || !controls) return;
    const ctl = controls as unknown as { target: THREE.Vector3; update: () => void };
    const t = new THREE.Vector3(...st.flyTarget);
    const k = 1 - Math.exp(-3.2 * Math.min(dt, 0.05));
    ctl.target.lerp(t, k);
    const dir = camera.position.clone().sub(t).normalize();
    const desired = t.clone().add(dir.multiplyScalar(st.flyDistance));
    camera.position.lerp(desired, k);
    ctl.update();
    if (camera.position.distanceTo(desired) < 0.5) st.arrive(); // 到着 → ロック解除
  });
  return null;
}

/* 初回操作までの自動回転 (宇宙全体がゆっくり回る) */
function IdleRotate() {
  const { controls } = useThree();
  const idle = useAtlas((s) => s.idle);
  useEffect(() => {
    if (!controls) return;
    const ctl = controls as unknown as { autoRotate: boolean; autoRotateSpeed: number };
    ctl.autoRotate = idle;
    ctl.autoRotateSpeed = 0.35; // 約5分で1周
  }, [controls, idle]);
  return null;
}

/* ホバー/フォーカス対象の3D→スクリーン座標変換 (毎フレーム) */
function ScreenTracker() {
  const { camera, size } = useThree();
  const v = new THREE.Vector3();
  useFrame(() => {
    const st = useAtlas.getState();
    const id = st.hoverId ?? st.focusedId;
    const b = id != null ? st.bodies.get(id) : undefined;
    if (!b) { screen.visible = false; return; }
    v.set(b.p[0], b.p[1], b.p[2]);
    const dist = camera.position.distanceTo(v);
    v.project(camera);
    if (v.z > 1) { screen.visible = false; return; }
    const fov = (camera as THREE.PerspectiveCamera).fov;
    const pxFactor = Math.tan(THREE.MathUtils.degToRad(fov) / 2) / (size.height / 2);
    view.pxFactor = pxFactor;
    const rPx = (b.d / 2) / (dist * pxFactor);
    screen.x = (v.x * 0.5 + 0.5) * size.width;
    screen.y = (-v.y * 0.5 + 0.5) * size.height;
    screen.r = Math.max(rPx, 5);
    screen.id = b.id;
    screen.visible = true;
  });
  return null;
}

export default function Universe() {
  return (
    <Canvas
      camera={{ position: [0, 1200, 2900], fov: 55, near: 0.5, far: 30000 }}
      gl={{ antialias: true }}
      dpr={[1, 2]}
    >
      <color attach="background" args={['#030308']} />
      <Stars radius={12000} depth={3000} count={3000} factor={8} saturation={0} fade speed={0} />
      <Bodies />
      <GalaxyLabels />
      <CameraRig />
      <IdleRotate />
      <ScreenTracker />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={3}
        maxDistance={3400}
      />
      <EffectComposer>
        <Bloom luminanceThreshold={0.85} intensity={0.35} mipmapBlur radius={0.6} />
      </EffectComposer>
    </Canvas>
  );
}
