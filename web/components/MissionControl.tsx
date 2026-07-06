'use client';

// Mission Control: Search右側の小さな円形ボタン群 (↺ Reset / ✦ Explore / ◐ Mode / ⤓ Share)
// + トースト / Daily Expedition / 初回オンボーディング1行。
// すべて開閉式・半透明・宇宙の視界を塞がない。
import { useEffect, useRef, useState } from 'react';
import { useAtlas, type UniverseMode } from '../lib/store';
import { ACTIONS, dailyExpedition, runAction } from '../lib/explore';
import { bridge } from '../lib/captureBus';

const MODES: { id: UniverseMode; label: string; desc: string }[] = [
  { id: 'explore', label: 'Explore', desc: '通常の宇宙' },
  { id: 'popularity', label: 'Popularity', desc: '影響力の大きい星を強調' },
  { id: 'gems', label: 'Hidden Gems', desc: '埋もれた名作だけが光る' },
  { id: 'timeline', label: 'Timeline', desc: '発売年で着色 (暖=古い 寒=新しい)' },
];

async function downloadCapture(subtitle?: string) {
  const src = bridge.capture?.();
  if (!src) return false;
  const img = new Image();
  await new Promise((r) => { img.onload = r; img.src = src; });
  const W = 1600, H = 900;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  x.fillStyle = '#030308';
  x.fillRect(0, 0, W, H);
  const s = Math.max(W / img.width, H / img.height);
  x.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
  const grad = x.createLinearGradient(0, H - 150, 0, H);
  grad.addColorStop(0, 'rgba(3,3,8,0)');
  grad.addColorStop(1, 'rgba(3,3,8,0.92)');
  x.fillStyle = grad;
  x.fillRect(0, H - 150, W, 150);
  x.fillStyle = 'rgba(235,242,250,0.92)';
  x.font = '600 30px -apple-system, "Segoe UI", sans-serif';
  x.fillText('STEAM GALAXY ATLAS', 40, H - 58);
  if (subtitle) {
    x.fillStyle = 'rgba(200,215,235,0.75)';
    x.font = '400 21px -apple-system, "Segoe UI", sans-serif';
    x.fillText(subtitle, 40, H - 26);
  }
  x.textAlign = 'right';
  x.fillStyle = 'rgba(255,255,255,0.42)';
  x.font = '400 17px -apple-system, "Segoe UI", sans-serif';
  x.fillText('steam-galaxy-atlas.vercel.app · unofficial fan project', W - 40, H - 30);
  const a = document.createElement('a');
  a.download = 'steam-galaxy-atlas.png';
  a.href = c.toDataURL('image/png');
  a.click();
  return true;
}

export default function MissionControl() {
  const universe = useAtlas((s) => s.universe);
  const mode = useAtlas((s) => s.mode);
  const toast = useAtlas((s) => s.toast);
  const [panel, setPanel] = useState<'none' | 'explore' | 'mode'>('none');
  const [toastVisible, setToastVisible] = useState(false);
  const [expedition, setExpedition] = useState<ReturnType<typeof dailyExpedition> | null>(null);
  const [onboard, setOnboard] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // トースト自動フェード
  useEffect(() => {
    if (!toast) return;
    setToastVisible(true);
    const t = setTimeout(() => setToastVisible(false), 3600);
    return () => clearTimeout(t);
  }, [toast]);

  // Daily Expedition (ロード毎・10秒) / 初回オンボーディング (初訪問のみ・9秒)
  useEffect(() => {
    if (!universe) return;
    const exp = dailyExpedition();
    setExpedition(exp);
    const t1 = setTimeout(() => setExpedition(null), 10000);
    let t2: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!localStorage.getItem('sga_seen')) {
        setOnboard(true);
        localStorage.setItem('sga_seen', '1');
        t2 = setTimeout(() => setOnboard(false), 9000);
      }
    } catch { /* localStorage不可でも動作 */ }
    return () => { clearTimeout(t1); if (t2) clearTimeout(t2); };
  }, [universe]);

  // 外側クリック/Escでパネルを閉じる
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

  const share = async () => {
    setPanel('none');
    const st = useAtlas.getState();
    const focus = st.focusedId ?? st.drawerId;
    const name = focus != null ? st.bodies.get(focus)?.t : undefined;
    const ok = await downloadCapture(name);
    st.showToast(ok ? 'Image saved' : 'Capture failed');
  };

  return (
    <div ref={rootRef} className="mc">
      <div className="mc-item">
        <button className="legend-btn" title="Reset view" aria-label="Reset view"
          onClick={() => { setPanel('none'); useAtlas.getState().resetView(); }}>
          ↺
        </button>
      </div>
      <div className="mc-item">
        <button className={`legend-btn${panel === 'explore' ? ' open' : ''}`}
          title="Explore" aria-label="Explore"
          onClick={() => setPanel(panel === 'explore' ? 'none' : 'explore')}>
          ✦
        </button>
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
          title="Universe mode" aria-label="Universe mode"
          onClick={() => setPanel(panel === 'mode' ? 'none' : 'mode')}>
          ◐
        </button>
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
        <button className="legend-btn" title="Save image" aria-label="Save image" onClick={share}>
          ⤓
        </button>
      </div>

      {/* トースト / Daily Expedition / オンボーディング (同じスロット、優先順) */}
      {toast && toastVisible ? (
        <div className="mc-line" key={toast.id}>{toast.text}</div>
      ) : expedition ? (
        <button className="mc-line mc-exp" onClick={() => { setExpedition(null); explore(expedition.id); }}>
          Today&apos;s expedition: {expedition.daily} →
        </button>
      ) : onboard ? (
        <div className="mc-line mc-onboard">
          Search a game · Double-click a star · Follow the route
        </div>
      ) : null}
    </div>
  );
}
