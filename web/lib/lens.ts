// Developer Lens: 対象ゲームの市場ポジション分析 (純関数)。
// 将来パイプライン側のレポート生成 (有料PDF等) に昇格できるようUI非依存で実装。
// すべて推定値ベース (SteamSpy)。relation_scoreは近似 (top-8タグ)。
import type { Body, Universe } from './types';
import { relationApprox } from './relation';

export type TagsMeta = Record<string, [number, number, number, number, number]>;
// tag → [n, ownersPerTitle(k), avgWilson, gemRate, opportunity]

export interface LensEntry {
  b: Body;
  score: number;
  sharedTags: string[];
}

export interface LensReport {
  target: Body;
  primaryTag: string;
  cohortSize: number;
  competitors: LensEntry[];
  gems: LensEntry[];
  tagBreakdown: [string, number][];
  positions: { metric: string; pct: number; value: string }[];
  opportunities: { tag: string; opp: number; n: number; q: number }[];
}

export const fmtOwners = (n: number) =>
  n >= 1e6 ? `~${(n / 1e6).toFixed(1)}M` : `~${Math.round(n / 1000)}k`;

const percentile = (arr: number[], v: number) => {
  if (arr.length < 2) return 50;
  const s = arr.slice().sort((a, b) => a - b);
  let i = 0;
  while (i < s.length && s[i] <= v) i++;
  return Math.round((100 * (i - 1)) / (s.length - 1));
};

export function buildLens(u: Universe, appid: number, tagsMeta: TagsMeta | null): LensReport | null {
  const target = u.bodies.find((b) => b.id === appid);
  if (!target?.tg?.length) return null;
  const tset = new Set(target.tg);

  const scored: LensEntry[] = [];
  for (const b of u.bodies) {
    if (b.id === appid || b.ty === 'moon' || !b.tg) continue;
    if (!b.tg.some((t) => tset.has(t))) continue;
    const r = relationApprox(target, b);
    if (r.score >= 0.15) scored.push({ b, score: r.score, sharedTags: r.sharedTags });
  }
  scored.sort((a, b) => b.score - a.score);
  const competitors = scored.slice(0, 10);
  const gems = scored.filter((x) => (x.b.hg ?? 0) >= 60 && !competitors.includes(x)).slice(0, 6);

  const tagCount = new Map<string, number>();
  for (const c of competitors) {
    for (const t of c.sharedTags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  }
  const tagBreakdown = [...tagCount].sort((a, b) => b[1] - a[1]).slice(0, 8) as [string, number][];

  const primaryTag = target.tg[0];
  const cohort = u.bodies.filter((b) => b.tg?.includes(primaryTag));
  const positions: LensReport['positions'] = [
    { metric: 'influence', pct: percentile(cohort.map((b) => b.inf), target.inf), value: String(target.inf) },
  ];
  if (target.rv) {
    positions.push({
      metric: 'positive reviews',
      pct: percentile(cohort.filter((b) => b.rv).map((b) => b.rv![1]), target.rv[1]),
      value: `${target.rv[1]}% (${target.rv[0].toLocaleString()})`,
    });
  }
  if (target.ow) {
    positions.push({
      metric: 'est. owners',
      pct: percentile(cohort.filter((b) => b.ow).map((b) => b.ow!), target.ow),
      value: fmtOwners(target.ow),
    });
  }
  if (target.pr != null) {
    positions.push({
      metric: 'price',
      pct: percentile(cohort.filter((b) => b.pr != null).map((b) => b.pr!), target.pr),
      value: `$${target.pr.toFixed(2)}`,
    });
  }

  const opportunities = tagsMeta
    ? (target.tg ?? [])
        .filter((t) => tagsMeta[t])
        .map((t) => ({ tag: t, opp: tagsMeta[t][4], n: tagsMeta[t][0], q: tagsMeta[t][2] }))
        .sort((a, b) => b.opp - a.opp)
        .slice(0, 3)
    : [];

  return { target, primaryTag, cohortSize: cohort.length, competitors, gems, tagBreakdown, positions, opportunities };
}
