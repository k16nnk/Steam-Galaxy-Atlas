// 2タイトル間の関連スコア内訳を表示する開発者用ツール。
//   node pipeline/report-relations.js 367520 1222140
//   node pipeline/report-relations.js "hollow knight" "detroit"   (タイトル部分一致も可)
import { openDb, parseOwners, relation } from './lib.js';

const db = openDb();
const spy = new Map(db.prepare('SELECT appid,json FROM raw_steamspy_detail').all()
  .map((r) => [r.appid, JSON.parse(r.json)]));
const rows = db.prepare('SELECT appid,json FROM raw_steamspy_all').all();

const load = (r) => {
  const a = JSON.parse(r.json);
  const s = spy.get(r.appid);
  const tags = s && s.tags && !Array.isArray(s.tags) ? s.tags : null;
  const tagList = tags
    ? Object.entries(tags).sort((x, y) => y[1] - x[1]).map(([t]) => t).slice(0, 20) : [];
  const rc = (a.positive ?? 0) + (a.negative ?? 0);
  return {
    appid: r.appid, title: a.name || `App ${r.appid}`,
    developer: a.developer || null, publisher: a.publisher || null,
    genreStr: s?.genre || '', tagList, tagSet: new Set(tagList),
    average_forever: a.average_forever ?? null,
    review_pct: rc ? Math.round(((a.positive ?? 0) / rc) * 100) : null,
    owners_mid: parseOwners(a.owners).mid,
    seriesKey: (a.name || '').toLowerCase().replace(/[®™©]/g, '')
      .replace(/:\s.*$|\s[-–—]\s.*$/, '').replace(/\s+\d+\s*$/, '')
      .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(),
  };
};
const all = rows.map(load);
const find = (q) => /^\d+$/.test(q)
  ? all.find((g) => g.appid === +q)
  : all.filter((g) => g.title.toLowerCase().includes(q.toLowerCase()))
      .sort((x, y) => (y.owners_mid ?? 0) - (x.owners_mid ?? 0))[0];

const [qa, qb] = process.argv.slice(2);
if (!qa || !qb) { console.error('usage: report-relations.js <appid|title> <appid|title>'); process.exit(1); }
const A = find(qa), B = find(qb);
if (!A || !B) { console.error('not found:', !A ? qa : qb); process.exit(1); }

const r = relation(A, B);
console.log(`\n${A.title} (${A.appid})  vs  ${B.title} (${B.appid})\n`);
console.table({
  shared_tags: { value: r.sharedTags.join(', ') || '(none)' },
  tag_similarity: { value: r.tagSim.toFixed(3) },
  shared_genres: { value: r.sharedGenres.join(', ') || '(none)' },
  genre_similarity: { value: r.genreSim.toFixed(3) },
  series_match: { value: r.series },
  same_developer: { value: r.dev },
  same_publisher: { value: r.pub },
  playtime_similarity: { value: r.playSim.toFixed(3) },
  review_profile_similarity: { value: r.reviewSim.toFixed(3) },
  final_relation_score: { value: r.score.toFixed(3) },
});
