'use client';

import { useEffect, useRef } from 'react';
import { useAtlas } from '../lib/store';

/* Search右横の円形凡例ボタン + クリックで右に伸びる小パネル */

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

export default function Legend() {
  const open = useAtlas((s) => s.legendOpen);
  const setOpen = useAtlas((s) => s.setLegendOpen);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  return (
    <div ref={ref} className="legend">
      <button
        className={`legend-btn${open ? ' open' : ''}`}
        aria-label="Legend"
        onClick={() => setOpen(!open)}
      >
        i
      </button>
      {open && (
        <div className="legend-panel">
          <div className="legend-col">
            {GENRES.map(([n, c]) => (
              <div key={n} className="legend-row">
                <span className="legend-chip" style={{ background: c }} />
                {n}
              </div>
            ))}
          </div>
          <div className="legend-col">
            {TYPES.map(([n, desc, s]) => (
              <div key={n} className="legend-row">
                <span className="legend-dot" style={{ width: s, height: s }} />
                <span className="legend-type">{n}</span>
                {desc}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
