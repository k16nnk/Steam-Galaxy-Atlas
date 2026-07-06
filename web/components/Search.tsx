'use client';

import { useMemo, useRef, useState } from 'react';
import { useAtlas } from '../lib/store';
import type { Body } from '../lib/types';

/* 左下の最小Search UI (唯一の常時表示UI) */
export default function Search() {
  const universe = useAtlas((s) => s.universe);
  const flyTo = useAtlas((s) => s.flyTo);
  const clearFocus = useAtlas((s) => s.clearFocus);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const hits = useMemo(() => {
    if (!universe || q.trim().length < 2) return [];
    const s = q.trim().toLowerCase();
    return universe.bodies
      .filter((b) => b.t.toLowerCase().includes(s))
      .sort((a, b) => b.inf - a.inf)
      .slice(0, 6);
  }, [universe, q]);

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
        onChange={(e) => {
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
