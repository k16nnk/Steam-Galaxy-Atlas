'use client';

import { useMemo, useRef, useState } from 'react';
import { useAtlas } from '../lib/store';
import type { Body } from '../lib/types';

/* 左下の最小Search UI (唯一の常時表示UI) */
export default function Search() {
  const universe = useAtlas((s) => s.universe);
  const flyTo = useAtlas((s) => s.flyTo);
  const clearFocus = useAtlas((s) => s.clearFocus);
  const setIdle = useAtlas((s) => s.setIdle);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // 検索インデックスは一度だけ構築 (キーストロークごとのtoLowerCaseを避けINPを改善)
  const index = useMemo(() => {
    if (!universe) return [];
    return universe.bodies
      .map((b) => ({ lower: b.t.toLowerCase(), b }))
      .sort((a, c) => c.b.inf - a.b.inf); // 事前にinf降順
  }, [universe]);

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const out = [];
    for (const e of index) { // inf順に走査し6件で打ち切り
      if (e.lower.includes(s)) {
        out.push(e.b);
        if (out.length === 6) break;
      }
    }
    return out;
  }, [index, q]);

  const pick = (b: Body) => {
    flyTo(b, 'search');
    setQ('');
    setIdx(0);
    inputRef.current?.blur();
  };

  return (
    <div className="search">
      {hits.length > 0 && (
        <div className="search-suggest">
          {hits.map((b, i) => (
            <button
              key={b.id}
              className={i === idx ? 'active' : ''}
              onMouseEnter={() => setIdx(i)}
              onClick={() => pick(b)}
            >
              {b.t}
              {b.rel ? ` (${b.rel.slice(0, 4)})` : ''}
            </button>
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        value={q}
        placeholder="Search"
        spellCheck={false}
        onFocus={() => setIdle(false)}
        onChange={(e) => {
          setIdle(false);
          setQ(e.target.value);
          setIdx(0);
          if (e.target.value.trim() === '') clearFocus(); // 空欄でフォーカス解除
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && hits[idx]) pick(hits[idx]);
          else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(hits.length - 1, i + 1)); }
          else if (e.key === 'Escape') setQ('');
        }}
      />
    </div>
  );
}
