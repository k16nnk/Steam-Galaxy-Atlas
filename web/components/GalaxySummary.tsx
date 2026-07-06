'use client';

// 銀河ラベルにホバーしたときだけ右下に出る小さなサマリー
import { useMemo } from 'react';
import { useAtlas } from '../lib/store';

export default function GalaxySummary() {
  const universe = useAtlas((s) => s.universe);
  const galaxyHoverId = useAtlas((s) => s.galaxyHoverId);

  const stats = useMemo(() => {
    if (!universe) return null;
    const m = new Map<string, { games: number; stars: number; gems: number; top: string[] }>();
    for (const g of universe.galaxies) m.set(g.id, { games: 0, stars: 0, gems: 0, top: [] });
    const tops = new Map<string, { t: string; inf: number }[]>();
    for (const b of universe.bodies) {
      const s = m.get(b.gal);
      if (!s) continue;
      s.games++;
      if (b.ty === 'star') s.stars++;
      if ((b.hg ?? 0) >= 60) s.gems++;
      if (!tops.has(b.gal)) tops.set(b.gal, []);
      const arr = tops.get(b.gal)!;
      arr.push({ t: b.t, inf: b.inf });
    }
    for (const [id, arr] of tops) {
      m.get(id)!.top = arr.sort((a, b) => b.inf - a.inf).slice(0, 3).map((x) => x.t);
    }
    return m;
  }, [universe]);

  const g = universe?.galaxies.find((x) => x.id === galaxyHoverId);
  const s = g && stats?.get(g.id);
  if (!g || !s) return null;

  return (
    <div className="gsum">
      <div className="gsum-name">{g.name}</div>
      {g.tags.length > 0 && <div className="gsum-tags">{g.tags.join(' / ')}</div>}
      <div className="gsum-row">
        <span>{s.games.toLocaleString()} games</span>
        <span>{s.stars} stars</span>
        <span>{s.gems} hidden gems</span>
      </div>
      <div className="gsum-top">{s.top.join(' · ')}</div>
    </div>
  );
}
