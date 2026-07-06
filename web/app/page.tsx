'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useAtlas } from '../lib/store';
import Overlay from '../components/Overlay';
import Search from '../components/Search';
import Legend from '../components/Legend';
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

  // Escでフォーカス解除 (凡例はLegend側で処理)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useAtlas.getState().clearFocus();
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
      <DebugPanel />
      <DevLens />
    </main>
  );
}
