'use client';

import { useEffect, useState } from 'react';
import { useAtlas } from '../lib/store';
import { relationApprox } from '../lib/relation';

/* ?debug=1 のときだけ有効。ホバー天体と空間的近傍8件の関連スコアを
   console.table + 右下の小パネルに表示する開発者用オーバーレイ */

interface Row { title: string; score: number; dist: number; shared: string; sameSys: boolean }

export default function DebugPanel() {
  const [enabled, setEnabled] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const hoverId = useAtlas((s) => s.hoverId);
  const universe = useAtlas((s) => s.universe);

  useEffect(() => {
    setEnabled(new URLSearchParams(window.location.search).has('debug'));
  }, []);

  useEffect(() => {
    if (!enabled || hoverId == null || !universe) { setRows([]); return; }
    const me = universe.bodies.find((b) => b.id === hoverId);
    if (!me) { setRows([]); return; }
    const near = universe.bodies
      .filter((b) => b.id !== me.id)
      .map((b) => ({
        b,
        dist: Math.hypot(b.p[0] - me.p[0], b.p[1] - me.p[1], b.p[2] - me.p[2]),
      }))
      .sort((a, c) => a.dist - c.dist)
      .slice(0, 8)
      .map(({ b, dist }) => {
        const r = relationApprox(me, b);
        return {
          title: b.t,
          score: +r.score.toFixed(3),
          dist: +dist.toFixed(1),
          shared: r.sharedTags.slice(0, 4).join(', ') || '-',
          sameSys: !!me.sys && b.sys === me.sys,
        };
      });
    // eslint-disable-next-line no-console
    console.log(`[debug] ${me.t} (${me.id}) sys=${me.sys ?? '-'} gal=${me.gal}`);
    // eslint-disable-next-line no-console
    console.table(near);
    setRows(near);
  }, [enabled, hoverId, universe]);

  if (!enabled || !rows.length) return null;
  return (
    <div className="debug-panel">
      {rows.map((r) => (
        <div key={r.title} className={r.sameSys ? 'same-sys' : ''}>
          {r.score.toFixed(2)} · {r.dist}u · {r.title}
        </div>
      ))}
    </div>
  );
}
