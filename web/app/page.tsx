'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useAtlas } from '../lib/store';
import Overlay from '../components/Overlay';
import Search from '../components/Search';
import Legend from '../components/Legend';
import MissionControl from '../components/MissionControl';
import Drawer from '../components/Drawer';
import GalaxySummary from '../components/GalaxySummary';
import DebugPanel from '../components/DebugPanel';
import DevLens from '../components/DevLens';

const UniverseCanvas = dynamic(() => import('../components/Universe'), { ssr: false });

export default function Page() {
  const setUniverse = useAtlas((s) => s.setUniverse);
  useEffect(() => {
    fetch('/universe.json')
      .then((r) => r.json())
      .then(setUniverse)
      .catch(() => {});
  }, [setUniverse]);

  // Escでフォーカス解除+ドロワーを閉じる (凡例/パネルは各コンポーネント側で処理)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        useAtlas.getState().clearFocus();
        useAtlas.getState().closeDrawer();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <main>
      <UniverseCanvas />
      <Overlay />
      <Search />
      <Legend />
      <MissionControl />
      <Drawer />
      <GalaxySummary />
      <DebugPanel />
      <DevLens />
    </main>
  );
}
