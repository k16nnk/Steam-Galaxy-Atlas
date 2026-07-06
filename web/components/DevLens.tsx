'use client';

// 開発者向けレンズ: ?lens=developer&appid=367520 でのみ有効。
// 一般ユーザーのUIには一切露出しない。
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAtlas } from '../lib/store';
import { buildLens, fmtOwners, type TagsMeta } from '../lib/lens';

export default function DevLens() {
  const [query, setQuery] = useState<{ enabled: boolean; appid: number }>({ enabled: false, appid: 0 });
  const universe = useAtlas((s) => s.universe);
  const flyTo = useAtlas((s) => s.flyTo);
  const [tagsMeta, setTagsMeta] = useState<TagsMeta | null>(null);
  const [closed, setClosed] = useState(false);
  const flew = useRef(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setQuery({ enabled: p.get('lens') === 'developer', appid: Number(p.get('appid') || 0) });
  }, []);

  useEffect(() => {
    if (!query.enabled) return;
    fetch('/tags.json').then((r) => r.json()).then(setTagsMeta).catch(() => setTagsMeta({}));
  }, [query.enabled]);

  const report = useMemo(
    () => (query.enabled && query.appid && universe ? buildLens(universe, query.appid, tagsMeta) : null),
    [query, universe, tagsMeta],
  );

  useEffect(() => {
    if (report && !flew.current) {
      flew.current = true;
      flyTo(report.target, 'search');
    }
  }, [report, flyTo]);

  if (!query.enabled) return null;
  if (closed) return null;
  if (query.enabled && universe && !report) {
    return <div className="lens-panel">appid {query.appid || '(未指定)'} が見つからないか、タグデータがありません。</div>;
  }
  if (!report) return null;

  const t = report.target;

  // 簡易レポートのJSON出力 (将来の有料レポートの原型)
  const exportJson = () => {
    const data = {
      generated_at: new Date().toISOString(),
      disclaimer: 'All figures are estimates based on SteamSpy data. Unofficial — not affiliated with Valve.',
      target_game: { appid: t.id, title: t.t, developer: t.dev, publisher: t.pub, released: t.rel },
      market_position: report.positions.map((p) => ({ metric: p.metric, value: p.value, percentile: p.pct })),
      primary_tag_cohort: { tag: report.primaryTag, titles: report.cohortSize },
      nearest_competitors: report.competitors.map((c) => ({
        appid: c.b.id, title: c.b.t, relation_score: +c.score.toFixed(3),
        shared_tags: c.sharedTags, est_owners: c.b.ow ?? null,
        positive_pct: c.b.rv?.[1] ?? null, price: c.b.pr ?? null,
      })),
      similar_hidden_gems: report.gems.map((c) => ({
        appid: c.b.id, title: c.b.t, hidden_gem_score: c.b.hg, relation_score: +c.score.toFixed(3),
      })),
      shared_tag_breakdown: Object.fromEntries(report.tagBreakdown),
      opportunity_notes: report.opportunities,
    };
    const a = document.createElement('a');
    a.download = `sga-report-${t.id}.json`;
    a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2));
    a.click();
  };

  return (
    <div className="lens-panel">
      <div className="lens-head">
        <span>DEVELOPER LENS</span>
        <span>
          <button onClick={exportJson} title="Export JSON report" style={{ fontSize: 11 }}>⤓ JSON</button>
          <button onClick={() => setClosed(true)} aria-label="close">×</button>
        </span>
      </div>
      <h3>{t.t}</h3>
      <div className="lens-sub">{t.dev}{t.rel ? ` · ${t.rel.slice(0, 10)}` : ''}</div>

      <h4>Position in “{report.primaryTag}” ({report.cohortSize} titles)</h4>
      {report.positions.map((p) => (
        <div key={p.metric} className="lens-row">
          <span>{p.metric}</span>
          <span>{p.value} <em>p{p.pct}</em></span>
        </div>
      ))}

      <h4>Nearest competitors</h4>
      {report.competitors.map((c) => (
        <div key={c.b.id} className="lens-row">
          <span>{c.b.t}</span>
          <span>{Math.round(c.score * 100)}{c.b.ow ? ` · ${fmtOwners(c.b.ow)}` : ''}{c.b.rv ? ` · ${c.b.rv[1]}%` : ''}</span>
        </div>
      ))}

      {report.gems.length > 0 && (
        <>
          <h4>Similar hidden gems</h4>
          {report.gems.map((c) => (
            <div key={c.b.id} className="lens-row">
              <span>{c.b.t}</span>
              <span>hg{c.b.hg} · {Math.round(c.score * 100)}</span>
            </div>
          ))}
        </>
      )}

      <h4>Shared-tag breakdown (top competitors)</h4>
      <div className="lens-tags">
        {report.tagBreakdown.map(([tag, n]) => <span key={tag}>{tag}×{n}</span>)}
      </div>

      {report.opportunities.length > 0 && (
        <>
          <h4>Opportunity notes</h4>
          {report.opportunities.map((o) => (
            <div key={o.tag} className="lens-row">
              <span>{o.tag}</span>
              <span>opp {o.opp} · {o.n} titles · avg {(o.q * 100).toFixed(0)}%</span>
            </div>
          ))}
        </>
      )}

      <div className="lens-foot">
        All figures are estimates (SteamSpy). relation_score is approximate (top-8 tags).
        Unofficial — not affiliated with Valve.
      </div>
    </div>
  );
}
