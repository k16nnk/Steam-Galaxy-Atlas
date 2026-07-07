'use client';

// Mission Control: 左下Searchの上に縦に並ぶ円形ボタン列。
//   ✦ Explore / ◐ Mode / ★ My Universe / i Legend / ↺ Reset
// ホバーで名称ラベル、クリックで右にパネル展開。
// + トースト / Daily Expedition / 初回オンボーディング (画面下中央)。
import { useEffect, useRef, useState } from 'react';
import { useAtlas, type UniverseMode } from '../lib/store';
import { ACTIONS, dailyExpedition, runAction } from '../lib/explore';

const MODES: { id: UniverseMode; label: string; desc: string }[] = [
  { id: 'explore', label: 'Explore', desc: '通常の宇宙' },
  { id: 'popularity', label: 'Popularity', desc: '影響力の大きい星を強調' },
  { id: 'gems', label: 'Hidden Gems', desc: '埋もれた名作だけが光る' },
  { id: 'timeline', label: 'Timeline', desc: '発売年で着色 (暖=古い 寒=新しい)' },
  { id: 'mine', label: 'My Games', desc: 'お気に入り・所持・旅先だけ表示' },
];

const GENRES: [string, string][] = [
  ['Action', 'hsl(8, 50%, 60%)'],
  ['RPG', 'hsl(275, 48%, 62%)'],
  ['Adventure', 'hsl(215, 48%, 62%)'],
  ['Strategy', 'hsl(130, 42%, 58%)'],
  ['Simulation', 'hsl(190, 45%, 62%)'],
  ['Sports', 'hsl(50, 52%, 60%)'],
  ['Horror', 'hsl(355, 45%, 40%)'],
  ['Puzzle', 'hsl(210, 15%, 78%)'],
  ['Indie / other', 'hsl(300, 35%, 70%)'],
];
const TYPES: [string, string, number][] = [
  ['Star', '中心的タイトル', 11],
  ['Planet', '関連タイトル', 8],
  ['Moon', 'DLC・派生', 5],
  ['Asteroid', '小規模・低データ', 3.5],
];

type Panel = 'none' | 'explore' | 'mode' | 'legend';

export default function MissionControl() {
  const universe = useAtlas((s) => s.universe);
  const started = useAtlas((s) => s.started);
  const mode = useAtlas((s) => s.mode);
  const myOpen = useAtlas((s) => s.myOpen);
  const toast = useAtlas((s) => s.toast);
  const [panel, setPanel] = useState<Panel>('none');
  const [toastVisible, setToastVisible] = useState(false);
  const [expedition, setExpedition] = useState<ReturnType<typeof dailyExpedition> | null>(null);
  const [onboard, setOnboard] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!toast) return;
    setToastVisible(true);
    const t = setTimeout(() => setToastVisible(false), 3600);
    return () => clearTimeout(t);
  }, [toast]);

  // スタート後にDaily Expedition (12秒) / 初回のみオンボーディング (10秒)
  useEffect(() => {
    if (!universe || !started) return;
    setExpedition(dailyExpedition());
    const t1 = setTimeout(() => setExpedition(null), 12000);
    let t2: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!localStorage.getItem('sga_seen')) {
        setOnboard(true);
        localStorage.setItem('sga_seen', '1');
        t2 = setTimeout(() => setOnboard(false), 10000);
      }
    } catch { /* ignore */ }
    return () => { clearTimeout(t1); if (t2) clearTimeout(t2); };
  }, [universe, started]);

  useEffect(() => {
    if (panel === 'none') return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setPanel('none');
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanel('none'); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [panel]);

  const explore = (id: string) => {
    setPanel('none');
    if (!universe) return;
    const st = useAtlas.getState();
    const r = runAction(universe, id);
    if (!r) return;
    if ('body' in r && r.body) {
      st.flyTo(r.body, 'search');
      st.showToast(r.toast);
    } else if ('point' in r) {
      st.flyToPoint(r.point, r.dist);
      st.showToast(r.toast);
    }
  };

  if (!started) return null;

  return (
    <>
      <div ref={rootRef} className="mc">
        <div className="mc-item">
          <button className={`legend-btn${panel === 'explore' ? ' open' : ''}`}
            onClick={() => setPanel(panel === 'explore' ? 'none' : 'explore')}>✦</button>
          <span className="mc-label">Explore</span>
          {panel === 'explore' && (
            <div className="mc-panel">
              {ACTIONS.map((a) => (
                <button key={a.id} onClick={() => explore(a.id)}>{a.label}</button>
              ))}
            </div>
          )}
        </div>
        <div className="mc-item">
          <button className={`legend-btn${panel === 'mode' ? ' open' : ''}`}
            onClick={() => setPanel(panel === 'mode' ? 'none' : 'mode')}>◐</button>
          <span className="mc-label">View mode</span>
          {panel === 'mode' && (
            <div className="mc-panel">
              {MODES.map((m) => (
                <button key={m.id} className={mode === m.id ? 'active' : ''}
                  onClick={() => { useAtlas.getState().setMode(m.id); setPanel('none'); }}>
                  <b>{m.label}</b>
                  <span>{m.desc}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mc-item">
          <button className={`legend-btn${myOpen ? ' open' : ''}`}
            onClick={() => { setPanel('none'); useAtlas.getState().setMyOpen(!myOpen); }}>★</button>
          <span className="mc-label">My universe</span>
        </div>
        <div className="mc-item">
          <button className={`legend-btn${panel === 'legend' ? ' open' : ''}`}
            onClick={() => setPanel(panel === 'legend' ? 'none' : 'legend')}>i</button>
          <span className="mc-label">Legend</span>
          {panel === 'legend' && (
            <div className="mc-panel legend-panel-v">
              <div className="legend-cols">
                <div className="legend-col">
                  {GENRES.map(([n, c]) => (
                    <div key={n} className="legend-row">
                      <span className="legend-chip" style={{ background: c }} />
                      {n}
                    </div>
                  ))}
                </div>
                <div className="legend-col">
                  {TYPES.map(([n, desc, sz]) => (
                    <div key={n} className="legend-row">
                      <span className="legend-dot" style={{ width: sz, height: sz }} />
                      <span className="legend-type">{n}</span>
                      {desc}
                    </div>
                  ))}
                  <div className="legend-row">
                    <span className="legend-dot" style={{ width: 7, height: 7, background: 'rgba(255,215,130,0.85)' }} />
                    <span className="legend-type">Gold</span>お気に入り
                  </div>
                </div>
              </div>
              <div className="legend-attrib">
                Data: SteamSpy (estimates) · Unofficial — not affiliated with Valve
              </div>
            </div>
          )}
        </div>
        <div className="mc-item">
          <button className="legend-btn"
            onClick={() => { setPanel('none'); useAtlas.getState().resetView(); }}>↺</button>
          <span className="mc-label">Reset view</span>
        </div>
      </div>

      {/* 画面下中央: トースト / Daily Expedition / オンボーディング */}
      {toast && toastVisible ? (
        <div className="center-line" key={toast.id}>{toast.text}</div>
      ) : expedition ? (
        <button className="center-line center-exp"
          onClick={() => { setExpedition(null); explore(expedition.id); }}>
          Today&apos;s expedition: {expedition.daily} →
        </button>
      ) : onboard ? (
        <div className="center-line center-onboard">
          Search a game · Double-click a star to travel · Click a star for details
        </div>
      ) : null}
    </>
  );
}
