'use client';

// スタート画面 (毎回表示・ロード画面兼用)。クリック/タッチで宇宙へ。
// 背後では既に宇宙がレンダリング+微回転しており、タイトルが薄れて没入する構成。
import { useEffect, useState } from 'react';
import { useAtlas } from '../lib/store';

export default function StartScreen() {
  const started = useAtlas((s) => s.started);
  const universe = useAtlas((s) => s.universe);
  const setStarted = useAtlas((s) => s.setStarted);
  const [leaving, setLeaving] = useState(false);

  // Enter/Spaceでも開始
  useEffect(() => {
    if (started) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') begin();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, universe]);

  const begin = () => {
    if (!universe || leaving) return;
    setLeaving(true);
    setTimeout(() => setStarted(), 650);
  };

  if (started) return null;
  return (
    <div className={`start${leaving ? ' leaving' : ''}`} onClick={begin} onTouchEnd={begin}>
      <div className="start-inner">
        <h1>STEAM GALAXY ATLAS</h1>
        <p className="start-sub">A universe formed by {universe ? universe.bodies.length.toLocaleString() : '…'} games</p>
        <p className={`start-cta${universe ? '' : ' loading'}`}>
          {universe ? 'click to start' : 'loading universe…'}
        </p>
      </div>
      <div className="start-foot">Unofficial fan project — not affiliated with Valve · Data: SteamSpy (estimates)</div>
    </div>
  );
}
