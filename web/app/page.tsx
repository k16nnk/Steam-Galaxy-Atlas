'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useAtlas } from '../lib/store';
import Overlay from '../components/Overlay';
import Search from '../components/Search';
import MissionControl from '../components/MissionControl';
import StartScreen from '../components/StartScreen';
import MyUniverse from '../components/MyUniverse';
import Drawer from '../components/Drawer';
import GalaxySummary from '../components/GalaxySummary';
import DebugPanel from '../components/DebugPanel';
import DevLens from '../components/DevLens';

const UniverseCanvas = dynamic(() => import('../components/Universe'), { ssr: false });

export default function Page() {
  const setUniverse = useAtlas((s) => s.setUniverse);
  const started = useAtlas((s) => s.started);
  useEffect(() => {
    useAtlas.getState().loadPersisted();
    fetch('/universe.json')
      .then((r) => r.json())
      .then(setUniverse)
      .catch(() => {});
  }, [setUniverse]);

  // Esc: 旅の状態 (航路・発光・照準・ドロワー) をまとめて解除
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useAtlas.getState().clearJourney();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <main>
      <UniverseCanvas />
      {started && (
        <>
          <Overlay />
          <Search />
          <Drawer />
          <GalaxySummary />
        </>
      )}
      <MissionControl />
      <MyUniverse />
      <StartScreen />
      <DebugPanel />
      <DevLens />
    </main>
  );
}
