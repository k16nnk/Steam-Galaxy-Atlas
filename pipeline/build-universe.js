// 正規化 → influence_score → 分類 → 星系/銀河クラスタリング → 座標生成 → universe.json
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import {
  openDb, ROOT, parseOwners, wilson, quantile, nlog, mulberry32, nowIso,
  jaccard, relation,
} from './lib.js';

const db = openDb();

/* ---------- 1. 正規化 ---------- */
const spyDetail = new Map(db.prepare('SELECT appid,json FROM raw_steamspy_detail').all()
  .map((r) => [r.appid, JSON.parse(r.json)]));
const storeDetail = new Map(db.prepare('SELECT appid,json,success FROM raw_store_detail').all()
  .filter((r) => r.success).map((r) => [r.appid, JSON.parse(r.json)]));

const games = db.prepare('SELECT appid,json,fetched_at FROM raw_steamspy_all').all().map((r) => {
  const a = JSON.parse(r.json);
  const spy = spyDetail.get(r.appid);
  const st = storeDetail.get(r.appid);
  const o = parseOwners(a.owners);
  const tags = spy && spy.tags && !Array.isArray(spy.tags) ? spy.tags : null;
  const tagList = tags
    ? Object.entries(tags).sort((x, y) => y[1] - x[1]).map(([t]) => t).slice(0, 20) : [];
  const positive = a.positive ?? 0, negative = a.negative ?? 0;
  const rc = positive + negative;
  let rel = null;
  if (st?.release_date?.date) {
    const ms = Date.parse(st.release_date.date);
    rel = Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : st.release_date.date;
  }
  const genreStr = spy?.genre || st?.genres?.join(', ') || '';
  return {
    appid: r.appid,
    title: st?.name || a.name || `App ${r.appid}`,
    developer: st?.developers?.join(', ') || a.developer || null,
    publisher: st?.publishers?.join(', ') || a.publisher || null,
    positive, negative, review_count: rc,
    review_pct: rc ? Math.round((positive / rc) * 100) : null,
    wilson: rc ? wilson(positive, rc) : 0,
    owners_min: o.min, owners_max: o.max, owners_mid: o.mid,
    ccu: a.ccu ?? null,
    average_forever: a.average_forever ?? null,
    average_2weeks: a.average_2weeks ?? null,
    median_forever: a.median_forever ?? null,
    price: a.price != null ? +a.price / 100 : null,
    is_free: a.price === '0' || a.price === 0 || !!st?.is_free,
    tags, tagList, tagSet: new Set(tagList), tagCount: tagList.length,
    genreStr, storeType: st?.type || null,
    fullgame: st?.fullgame?.appid ? +st.fullgame.appid : null,
    ea: genreStr.includes('Early Access') || tagList.includes('Early Access'),
    release_date: rel, enriched: !!spy,
    fetched_at: r.fetched_at,
  };
});
const byId = new Map(games.map((g) => [g.appid, g]));
console.log(`games: ${games.length}, enriched(spy): ${spyDetail.size}, store: ${storeDetail.size}`);

/* ---------- 2. 正規化基準・タグ中心性・人気プロキシ ---------- */
const P99 = {
  owners: quantile(games.map((g) => g.owners_mid), 0.99),
  reviews: quantile(games.map((g) => g.review_count), 0.99),
  ccu: quantile(games.map((g) => g.ccu), 0.99),
  play: quantile(games.map((g) => g.average_forever), 0.99),
  recent: quantile(games.map((g) => g.average_2weeks), 0.99),
};
const tagFreq = new Map();
for (const g of games) for (const t of g.tagList.slice(0, 10))
  tagFreq.set(t, (tagFreq.get(t) || 0) + 1);
const maxFreq = Math.max(1, ...tagFreq.values());
for (const g of games) {
  const top = g.tagList.slice(0, 10);
  g.tag_centrality = top.length
    ? top.reduce((s, t) => s + Math.log(1 + (tagFreq.get(t) || 0)) / Math.log(1 + maxFreq), 0) / top.length
    : 0;
  g.pop = 0.5 * nlog(g.owners_mid, P99.owners) + 0.3 * nlog(g.review_count, P99.reviews)
        + 0.2 * nlog(g.ccu, P99.ccu);
  g.primaryGenre = (g.genreStr.split(',')[0] || '').trim() || null;
}

/* ---------- 3. シリーズ・グループ中心性 ---------- */
const normTitle = (t) => t.toLowerCase().replace(/[®™©]/g, '')
  .replace(/:\s.*$|\s[-–—]\s.*$/, '')
  .replace(/\b(remastered|definitive|goty|game of the year|complete|edition|hd)\b.*$/, '')
  .replace(/\s+\b[ivx]+\b\s*$|\s+\d+\s*$/, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// jaccard / relation は lib.js から import (report-relations.js と共有)
const centrality = (rank, size) => (size > 1 ? 1 - rank / size : 0.5);
const rankIn = (group) => {
  group.sort((a, b) => b.pop - a.pop);
  group.forEach((g, i) => { g._rank = i; g._rankSize = group.length; });
};

// series groups (enriched only)
const seriesMap = new Map();
for (const g of games) {
  if (!g.enriched) continue;
  g.seriesKey = normTitle(g.title);
  if (!g.seriesKey) continue;
  if (!seriesMap.has(g.seriesKey)) seriesMap.set(g.seriesKey, []);
  seriesMap.get(g.seriesKey).push(g);
}
for (const [key, arr] of seriesMap) {
  if (arr.length < 2) { seriesMap.delete(key); continue; }
  const top = arr.reduce((m, g) => (g.pop > m.pop ? g : m));
  const kept = arr.filter((g) => g === top
    || (g.developer && g.developer === top.developer)
    || (g.publisher && g.publisher === top.publisher)
    || jaccard(g.tagSet, top.tagSet) >= 0.3);
  if (kept.length < 2) { seriesMap.delete(key); continue; }
  seriesMap.set(key, kept);
  rankIn(kept);
  for (const g of kept) {
    g.series_name = top.title;
    g.series_centrality = centrality(g._rank, g._rankSize);
  }
}
// developer / genre centrality
const devMap = new Map();
for (const g of games) {
  if (!g.enriched || !g.developer) continue;
  if (!devMap.has(g.developer)) devMap.set(g.developer, []);
  devMap.get(g.developer).push(g);
}
for (const arr of devMap.values()) {
  rankIn(arr);
  for (const g of arr) g.dev_centrality = centrality(g._rank, g._rankSize);
}
const genreMap = new Map();
for (const g of games) {
  if (!g.enriched || !g.primaryGenre) continue;
  if (!genreMap.has(g.primaryGenre)) genreMap.set(g.primaryGenre, []);
  genreMap.get(g.primaryGenre).push(g);
}
for (const arr of genreMap.values()) {
  rankIn(arr);
  for (const g of arr) g.genre_centrality = centrality(g._rank, g._rankSize);
}

/* ---------- 4. influence / gravity / luminosity / diameter / color ---------- */
for (const g of games) {
  const parts = [
    [0.25, g.owners_mid != null ? nlog(g.owners_mid, P99.owners) : null],
    [0.20, g.review_count ? nlog(g.review_count, P99.reviews) : null],
    [0.15, g.ccu != null ? nlog(g.ccu, P99.ccu) : null],
    [0.15, g.review_count ? g.wilson : null],
    [0.10, g.average_forever != null ? nlog(g.average_forever, P99.play) : null],
    [0.10, g.tagCount ? g.tag_centrality : null],
    [0.05, g.series_centrality ?? g.dev_centrality ?? null],
  ];
  const wSum = parts.reduce((s, [w, v]) => s + (v != null ? w : 0), 0);
  g.influence = wSum
    ? 100 * parts.reduce((s, [w, v]) => s + (v != null ? w * v : 0), 0) / wSum : 0;
  g.gravity = 0.5 * (g.influence / 100) + 0.2 * (g.series_centrality ?? 0.3)
    + 0.15 * (g.genre_centrality ?? 0.3) + 0.15 * (g.dev_centrality ?? 0.3);
  g.luminosity = Math.min(1, 0.45 * g.wilson + 0.25 * nlog(g.ccu, P99.ccu)
    + 0.20 * (g.influence / 100) + 0.10 * nlog(g.average_2weeks, P99.recent));
}
// 大小差の強調: influenceのpowカーブ + タイプ別レンジ。
// これは「物理サイズ」。画面上の視認下限とホバー判定はフロント側で別途担保する。
const SIZE = {
  star: (n) => 4.0 + 14.0 * Math.pow(n, 1.6),     // 4 .. 18 (上位は圧倒的に巨大)
  planet: (n) => 1.1 + 5.0 * Math.pow(n, 1.5),    // 1.1 .. 6.1
  moon: (n) => 0.45 + 0.9 * Math.pow(n, 1.5),     // 0.45 .. 1.35
  asteroid: (n) => 0.3 + 0.6 * n,                 // 0.3 .. 0.9
};
const diameterOf = (g) => SIZE[g.type](Math.min(1, Math.max(0, g.influence / 100)));
const hsl = (h, s, l) => {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)]
    .map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
};
const GENRE_COLOR = {
  Action: [8, 50, 60], RPG: [275, 48, 62], Adventure: [215, 48, 62],
  Strategy: [130, 42, 58], Simulation: [190, 45, 62], Sports: [50, 52, 60],
  Racing: [45, 50, 60], Casual: [160, 35, 65], 'Massively Multiplayer': [200, 45, 60],
};
const colorOf = (g) => {
  const rng = mulberry32(g.appid);
  if (g.type === 'asteroid') return hsl(rng() * 360, 10, 48 + rng() * 10);
  if (g.tagSet.has('Horror') || g.tagSet.has('Survival Horror')) return hsl(355, 45, 40);
  if (g.tagSet.has('Puzzle')) return hsl(210, 15, 78);
  const c = GENRE_COLOR[g.primaryGenre];
  if (c) return hsl(c[0] + (rng() - 0.5) * 14, c[1], c[2] + (rng() - 0.5) * 8);
  return hsl(rng() * 360, 35, 70); // Indie/その他: パステル
};

/* ---------- 5. 分類 (moon / asteroid / planet候補) ---------- */
const prefixIndex = games.filter((g) => g.enriched)
  .sort((a, b) => b.title.length - a.title.length);
for (const g of games) {
  const t = g.title;
  const moonish = ['dlc', 'music', 'demo'].includes(g.storeType) || g.fullgame
    || /(soundtrack|\bost\b|\bdemo\b|\bdlc\b|expansion pass)/i.test(t);
  if (moonish) {
    let parent = g.fullgame && byId.has(g.fullgame) ? g.fullgame : null;
    if (!parent) {
      const hit = prefixIndex.find((p) => p !== g && t.toLowerCase().startsWith(p.title.toLowerCase()) && p.title.length >= 4);
      parent = hit?.appid ?? null;
    }
    if (parent) { g.type = 'moon'; g.orbit_parent_id = parent; continue; }
  }
  if (!g.enriched || g.tagCount < 3 || g.review_count < 30 || (g.owners_mid ?? 0) < 20000) {
    g.type = 'asteroid'; continue;
  }
  g.type = 'planet'; // starは星系確定時に昇格
}

/* ---------- 6. 銀河 ---------- */
const GALAXIES = [
  ['g_comp', 'Multiplayer Competitive', ['PvP', 'Competitive', 'MOBA', 'esports', 'Battle Royale']],
  ['g_vn', 'Visual Novel', ['Visual Novel', 'Dating Sim']],
  ['g_horror', 'Horror', ['Horror', 'Survival Horror', 'Psychological Horror']],
  ['g_survival', 'Sandbox Survival', ['Survival', 'Open World Survival Craft', 'Crafting', 'Base Building', 'Sandbox']],
  ['g_rogue', 'Roguelike', ['Roguelike', 'Roguelite', 'Roguelike Deckbuilder']],
  ['g_cozy', 'Cozy', ['Cozy', 'Farming Sim', 'Life Sim', 'Relaxing']],
  ['g_strategy', 'Strategy', ['Strategy', '4X', 'Grand Strategy', 'Tower Defense', 'Turn-Based Strategy', 'RTS']],
  ['g_sim', 'Simulation', ['Simulation', 'Management', 'Automobile Sim', 'City Builder', 'Colony Sim']],
  ['g_rpg', 'RPG', ['RPG', 'JRPG', 'CRPG', 'Action RPG', 'Turn-Based RPG']],
  ['g_sports', 'Sports & Racing', ['Sports', 'Racing', 'Football', 'Soccer']],
  ['g_action', 'Action', ['Action', 'FPS', 'Shooter', 'Third-Person Shooter', 'Platformer', 'Hack and Slash', 'Fighting']],
  ['g_indie', 'Indie', []],
];
const assignGalaxy = (g) => {
  const top = new Set(g.tagList.slice(0, 8));
  for (const [id, , keys] of GALAXIES)
    if (keys.some((k) => top.has(k) || (g.primaryGenre && g.primaryGenre === k))) return id;
  return 'g_indie';
};
for (const g of games) {
  if (g.type === 'planet') g.galaxy = assignGalaxy(g);
}

/* ---------- 7. 星系 ---------- */
// 星系メンバーは中心恒星との relation_score が閾値以上のものだけ。
// どこにも属せない planet は「フィールド惑星」として銀河内に単独配置 (偽の近接を作らない)。
const REL_ATTACH = 0.22; // 既存星系への編入に必要な関連スコア
const REL_MEMBER = 0.16; // タグクラスタ星系に留まるのに必要な関連スコア
const systems = []; // {id, name, type, members:[g], star:g}
const inSystem = new Set();
const fieldPlanets = [];
const makeSystem = (members, type, name) => {
  const chunks = [];
  members.sort((a, b) => b.gravity - a.gravity);
  for (let i = 0; i < members.length; i += 40) chunks.push(members.slice(i, i + 40));
  for (const chunk of chunks) {
    const star = chunk[0];
    star.type = 'star';
    const id = `s_${star.appid}`;
    for (const m of chunk) { m.system = id; m.galaxy = star.galaxy; inSystem.add(m.appid); }
    systems.push({ id, name: name || star.title, type, members: chunk, star });
  }
};
const pool = games.filter((g) => g.type === 'planet');
// 7a. シリーズ星系
for (const arr of seriesMap.values()) {
  const members = arr.filter((g) => g.type === 'planet' && !inSystem.has(g.appid));
  if (members.length >= 2) makeSystem(members, 'series', members[0].series_name);
}
// 7b. 開発元星系 (3本以上)
for (const [dev, arr] of devMap) {
  const members = arr.filter((g) => g.type === 'planet' && !inSystem.has(g.appid));
  if (members.length >= 3) makeSystem(members, 'developer', dev);
}
// 7c. 残りを関連スコアで既存恒星へ編入 (タグ/ジャンル/開発元/シリーズの複合)
for (const g of pool) {
  if (inSystem.has(g.appid)) continue;
  let best = null, bestScore = 0;
  for (const s of systems) {
    if (s.star.galaxy !== g.galaxy || s.members.length >= 40) continue;
    const r = relation(g, s.star);
    if (r.score >= REL_ATTACH) {
      const sc = r.score * (0.5 + s.star.gravity);
      if (sc > bestScore) { bestScore = sc; best = s; }
    }
  }
  if (best) { g.system = best.id; best.members.push(g); inSystem.add(g.appid); }
}
// 7d. タグクラスタ星系 (銀河×主要タグ)
const clusterKey = (g) => `${g.galaxy}|${g.tagList[0] || 'misc'}`;
const clusters = new Map();
for (const g of pool) {
  if (inSystem.has(g.appid)) continue;
  const k = clusterKey(g);
  if (!clusters.has(k)) clusters.set(k, []);
  clusters.get(k).push(g);
}
for (const [k, arr] of clusters) {
  if (arr.length >= 2) {
    arr.sort((a, b) => b.gravity - a.gravity);
    const star = arr[0];
    // 恒星との関連が薄いメンバーは同居させない → フィールド惑星へ
    const keep = arr.filter((m) => m === star || relation(m, star).score >= REL_MEMBER);
    const rest = arr.filter((m) => !keep.includes(m));
    if (keep.length >= 2) makeSystem(keep, 'tag_cluster', `${k.split('|')[1]} Cluster`);
    else if (star.influence >= 70) makeSystem([star], 'solo');
    else fieldPlanets.push(...keep);
    fieldPlanets.push(...rest);
  } else {
    const g = arr[0];
    if (g.influence >= 70) makeSystem(arr, 'solo');
    else fieldPlanets.push(g); // 降格せず、銀河内に単独配置
  }
}
// moonの所属を親に合わせる (フィールド惑星の衛星も許可)
for (const g of games) {
  if (g.type !== 'moon') continue;
  const p = byId.get(g.orbit_parent_id);
  if (p && (p.type === 'star' || p.type === 'planet')) {
    g.system = p.system; g.galaxy = p.galaxy;
  } else { g.type = 'asteroid'; g.orbit_parent_id = null; }
}
// asteroidの銀河: 開発元一致 → その銀河 / なければシード乱数
const devGalaxy = new Map();
for (const g of games) if (g.galaxy && g.developer) devGalaxy.set(g.developer, g.galaxy);
const usedGalaxyIds = [...new Set(games.filter((g) => g.galaxy).map((g) => g.galaxy))];
for (const g of games) {
  if (g.type === 'asteroid' && !g.galaxy) {
    // 注意: シードは配置用 (appid) と別系統にする。同一シードを使うと
    // 「ランダムにこの銀河へ入った小惑星は角度も同じ」という相関が生じ、塊になる
    g.galaxy = (g.developer && devGalaxy.get(g.developer))
      || usedGalaxyIds[Math.floor(mulberry32(g.appid * 3 + 101)() * usedGalaxyIds.length)]
      || 'g_indie';
  }
}
for (const g of games) g.diameter = diameterOf(g);
for (const g of games) g.color = colorOf(g);

/* ---------- 8. 座標生成 (決定的・コンパクト3D星団) ----------
   (1) 各銀河のローカル座標で星系/惑星/衛星/フィールド惑星/小惑星を配置し実半径を計測
   (2) 実半径を使い Fibonacci球殻 + 反発緩和で銀河中心をコンパクトに配置 (円環配置は廃止)
   (3) ローカル座標を銀河中心へ平行移動 */
const DISC_RY = 130;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const activeGalaxies = GALAXIES.filter(([id]) => usedGalaxyIds.includes(id));
const byGalaxy = new Map(activeGalaxies.map(([id]) => [id, []]));
for (const s of systems) byGalaxy.get(s.star.galaxy)?.push(s);
const orbitExtent = (s) => s.star.diameter * 1.6 + 6 + 3.0 * s.members.length;

// (1a) 星系: 主要タグごとの角度セクター × 重力ランク半径 + 衝突緩和 (ローカル座標)
//      → 同系統タグの星系が同じ方向に集まり、隣接星系が無関係になる問題を解消
const galaxyR = new Map();
for (const [gal, arr] of byGalaxy) {
  if (!arr.length) { galaxyR.set(gal, 260); continue; }
  const groups = new Map();
  for (const s of arr) {
    const key = s.star.tagList[0] || 'misc';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const rankOf = new Map([...arr].sort((a, b) => b.star.gravity - a.star.gravity)
    .map((s, i) => [s, i]));
  const rMaxBase = 62 * Math.sqrt(arr.length) + 60;
  let acc = 0;
  for (const grp of [...groups.values()].sort((a, b) => b.length - a.length)) {
    const a0 = (acc / arr.length) * Math.PI * 2;
    acc += grp.length;
    const a1 = (acc / arr.length) * Math.PI * 2;
    grp.sort((a, b) => b.star.gravity - a.star.gravity);
    grp.forEach((s, j) => {
      const rng = mulberry32(s.star.appid);
      const r = 62 * Math.sqrt(rankOf.get(s) + 0.5) + (rng() - 0.5) * 30;
      const th = a0 + (a1 - a0) * (((j * 0.618) % 1) * 0.9 + 0.05) + (rng() - 0.5) * 0.06;
      s.p = [Math.cos(th) * r,
        (rng() - 0.5) * DISC_RY * 1.6 * (1 - 0.4 * Math.min(1, r / rMaxBase)),
        Math.sin(th) * r];
    });
  }
  for (let it = 0; it < 40; it++) { // 星系同士が軌道半径ぶん離れるよう反発
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const A = arr[i].p, B = arr[j].p;
        const need = (orbitExtent(arr[i]) + orbitExtent(arr[j])) * 0.55 + 24;
        const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2];
        const d = Math.hypot(dx, dy, dz) || 1;
        if (d < need) {
          const f = (need - d) / d / 2;
          A[0] -= dx * f; A[1] -= dy * f * 0.4; A[2] -= dz * f;
          B[0] += dx * f; B[1] += dy * f * 0.4; B[2] += dz * f;
        }
      }
    }
  }
  let rMax = rMaxBase;
  for (const s of arr) {
    s.star.pos = s.p;
    rMax = Math.max(rMax, Math.hypot(s.p[0], s.p[2]) + orbitExtent(s));
  }
  galaxyR.set(gal, rMax);
}
// (1b) 惑星: 恒星周りの傾いた軌道 (関連スコアが高いほど内側の軌道)
for (const s of systems) {
  const rng = mulberry32(s.star.appid * 31 + 7);
  let n = [(rng() - 0.5) * 0.8, 1, (rng() - 0.5) * 0.8];
  const nl = Math.hypot(...n); n = n.map((v) => v / nl);
  let u = [1, 0, 0];
  if (Math.abs(n[0]) > 0.9) u = [0, 0, 1];
  const ux = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  const ul = Math.hypot(...ux); const U = ux.map((v) => v / ul);
  const V = [n[1] * U[2] - n[2] * U[1], n[2] * U[0] - n[0] * U[2], n[0] * U[1] - n[1] * U[0]];
  const planets = s.members.filter((m) => m !== s.star)
    .sort((a, b) => relation(b, s.star).score - relation(a, s.star).score);
  planets.forEach((m, k) => {
    const rr = mulberry32(m.appid);
    const orbitR = s.star.diameter * 1.6 + 6 + 3.0 * (k + 1) + rr() * 2;
    const th = rr() * Math.PI * 2;
    m.pos = [0, 1, 2].map((i) => s.p[i] + orbitR * (U[i] * Math.cos(th) + V[i] * Math.sin(th)));
  });
}
// (1c) フィールド惑星: どの星系にも属さないplanetを銀河中盤に単独配置 (偽の近接を作らない)
for (const g of fieldPlanets) {
  if (g.system || g.type !== 'planet' || g.pos) continue;
  const rMax = galaxyR.get(g.galaxy) || 300;
  const rng = mulberry32(g.appid);
  const th = rng() * Math.PI * 2;
  const r = rMax * (0.45 + 0.45 * rng());
  g.pos = [Math.cos(th) * r, (rng() - 0.5) * DISC_RY * 1.3, Math.sin(th) * r];
}
// (1d) 衛星: 親の近傍 (ローカル)
for (const g of games) {
  if (g.type !== 'moon') continue;
  const p = byId.get(g.orbit_parent_id);
  if (!p?.pos) { g.type = 'asteroid'; continue; }
  const rng = mulberry32(g.appid);
  const d = p.diameter * 1.8 + 2;
  const th = rng() * Math.PI * 2, ph = (rng() - 0.5) * 2;
  g.pos = [p.pos[0] + d * Math.cos(th) * Math.cos(ph),
    p.pos[1] + d * Math.sin(ph), p.pos[2] + d * Math.sin(th) * Math.cos(ph)];
}
// (1e) 小惑星: エッジワース・カイパーベルト風 — 銀河外周の全周に薄く散布。
//      角度は全周一様 + 弱い濃淡、半径は外側ほど疎、垂直方向は外側ほど薄い
for (const g of games) {
  if (g.type !== 'asteroid') continue;
  const rMax = galaxyR.get(g.galaxy) || 300;
  const rng = mulberry32(g.appid);
  let th = rng() * Math.PI * 2;
  th += 0.18 * Math.sin(th * 2 + (g.appid % 7)); // ごく弱い濃淡
  const t = Math.pow(rng(), 1.6);                 // 内縁寄りに濃く、外側は疎
  const r = rMax * (0.85 + 0.55 * t);
  const flat = 1 - 0.6 * t;                       // 外側ほど薄い円盤
  g.pos = [Math.cos(th) * r, (rng() - 0.5) * DISC_RY * 1.1 * flat, Math.sin(th) * r];
}
// 光源方向 (ローカル座標で計算 — 平行移動不変)
const sysById = new Map(systems.map((s) => [s.id, s]));
for (const g of games) {
  if (g.type === 'star' || !g.pos) continue;
  const st = g.system ? sysById.get(g.system)?.star : null;
  const src = st?.pos || [0, 0, 0]; // フィールド惑星/小惑星は銀河中心からの光
  const d = [src[0] - g.pos[0], src[1] - g.pos[1], src[2] - g.pos[2]];
  const l = Math.hypot(...d) || 1;
  g.lightDir = d.map((v) => +(v / l).toFixed(2));
}

// (2) 銀河中心: Fibonacci球殻 (殻半径を分散させ中心空洞を回避) + 実半径ベースの反発緩和
const galaxyCenters = new Map();
{
  const ids = activeGalaxies.map(([id]) => id);
  const n = Math.max(ids.length, 1);
  ids.forEach((id, i) => {
    const y = 1 - (2 * (i + 0.5)) / n;
    const rr = Math.sqrt(Math.max(0, 1 - y * y));
    const th = i * GOLDEN;
    const shell = 0.40 + 0.60 * ((i * 0.618 + 0.15) % 1);
    const R = 950 * shell;
    galaxyCenters.set(id, [Math.cos(th) * rr * R, y * R * 0.55, Math.sin(th) * rr * R]);
  });
  for (let it = 0; it < 150; it++) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const A = galaxyCenters.get(ids[i]), B = galaxyCenters.get(ids[j]);
        const need = (galaxyR.get(ids[i]) || 300) + (galaxyR.get(ids[j]) || 300) + 130;
        const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2];
        const d = Math.hypot(dx, dy, dz) || 1;
        if (d < need) {
          const f = (need - d) / d / 2;
          A[0] -= dx * f; A[1] -= dy * f * 0.5; A[2] -= dz * f;
          B[0] += dx * f; B[1] += dy * f * 0.5; B[2] += dz * f;
        }
      }
    }
  }
  const c = [0, 1, 2].map((k) =>
    ids.reduce((sum, id) => sum + galaxyCenters.get(id)[k], 0) / n);
  for (const id of ids) {
    const p = galaxyCenters.get(id);
    p[0] -= c[0]; p[1] -= c[1]; p[2] -= c[2];
  }
}

// (3) ローカル座標 → ワールド座標 (銀河中心へ平行移動)
for (const g of games) {
  if (!g.pos) continue;
  const c = galaxyCenters.get(g.galaxy) || [0, 0, 0];
  g.pos = [g.pos[0] + c[0], g.pos[1] + c[1], g.pos[2] + c[2]];
}
for (const s of systems) s.p = s.star.pos; // 恒星(=games側)の平行移動結果を反映

/* ---------- 9. 出力 ---------- */
const r1 = (x) => +x.toFixed(1), r2 = (x) => +x.toFixed(2);
const bodies = games.filter((g) => g.pos || g.type === 'star').map((g) => {
  const b = {
    id: g.appid, t: g.title, ty: g.type,
    p: g.pos ? g.pos.map(r1) : null,
    d: r2(g.diameter), lum: r2(g.luminosity), c: g.color,
    gal: g.galaxy, inf: Math.round(g.influence),
  };
  if (g.system) b.sys = g.system;
  if (g.lightDir) b.ld = g.lightDir;
  if (g.release_date) b.rel = g.release_date;
  if (g.developer) b.dev = g.developer;
  if (g.review_count) b.rv = [g.review_count, g.review_pct];
  if (g.ea) b.ea = 1;
  if (g.tagList.length) b.tg = g.tagList.slice(0, 8); // debug関連スコア用
  if (g.publisher) b.pub = g.publisher;
  if (g.average_forever) b.pt = g.average_forever;
  return b;
}).filter((b) => b.p);

// 銀河の代表タグ (汎用タグを除いた上位3)
const GENERIC_TAGS = new Set(['Singleplayer', 'Multiplayer', 'Indie', 'Action', 'Adventure',
  'Casual', 'Great Soundtrack', 'Early Access', 'Free to Play', 'Co-op', 'Atmospheric',
  'Story Rich', '2D', '3D', 'First-Person', 'Third Person', 'Open World']);
const galaxyTags = new Map(activeGalaxies.map(([id]) => [id, new Map()]));
for (const g of games) {
  const m = galaxyTags.get(g.galaxy);
  if (!m || (g.type !== 'planet' && g.type !== 'star')) continue;
  for (const t of g.tagList.slice(0, 5)) m.set(t, (m.get(t) || 0) + 1);
}
const topTags = (id) => [...(galaxyTags.get(id) || new Map())]
  .filter(([t]) => !GENERIC_TAGS.has(t))
  .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);

const universe = {
  generated_at: nowIso(),
  note: 'estimated values (SteamSpy) — 所有者数等はすべて推定値',
  counts: bodies.reduce((m, b) => ((m[b.ty] = (m[b.ty] || 0) + 1), m), {}),
  galaxies: activeGalaxies.map(([id, name]) => ({
    id, name, p: galaxyCenters.get(id).map(r1),
    r: r1(galaxyR.get(id) || 300), tags: topTags(id),
  })),
  systems: systems.map((s) => ({ id: s.id, name: s.name, star: s.star.appid, gal: s.star.galaxy, p: s.p.map(r1) })),
  bodies,
};
const outDir = path.join(ROOT, 'web', 'public');
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'universe.json'), JSON.stringify(universe));
console.log('counts:', universe.counts, 'systems:', systems.length,
  'galaxies:', activeGalaxies.length);

/* ---------- 10. gamesテーブル保存 ---------- */
const ins = db.prepare(`INSERT OR REPLACE INTO games(
  appid,title,type,genre,tags,series_name,developer,publisher,release_date,
  review_positive,review_negative,review_score,review_count,
  estimated_owners_min,estimated_owners_max,estimated_owners_mid,
  ccu,average_playtime,median_playtime,price,is_free,capsule_image,header_image,steam_url,
  influence_score,diameter,gravity,luminosity,color,galaxy_id,system_id,orbit_parent_id,
  position_x,position_y,position_z,data_source,fetched_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
db.exec('BEGIN');
for (const g of games) {
  if (!g.pos) continue;
  ins.run(g.appid, g.title, g.type, g.genreStr, JSON.stringify(g.tagList),
    g.series_name ?? null, g.developer, g.publisher, g.release_date,
    g.positive, g.negative, g.wilson, g.review_count,
    g.owners_min, g.owners_max, g.owners_mid,
    g.ccu, g.average_forever, g.median_forever, g.price, g.is_free ? 1 : 0,
    `https://cdn.akamai.steamstatic.com/steam/apps/${g.appid}/capsule_231x87.jpg`,
    `https://cdn.akamai.steamstatic.com/steam/apps/${g.appid}/header.jpg`,
    `https://store.steampowered.com/app/${g.appid}/`,
    g.influence, g.diameter, g.gravity, g.luminosity, g.color,
    g.galaxy, g.system ?? null, g.orbit_parent_id ?? null,
    g.pos[0], g.pos[1], g.pos[2], 'steamspy+store', g.fetched_at);
}
const insSys = db.prepare(
  'INSERT OR REPLACE INTO systems(system_id,name,center_appid,system_type,main_genre,representative_tags,members) VALUES(?,?,?,?,?,?,?)');
for (const s of systems) insSys.run(s.id, s.name, s.star.appid, s.type,
  s.star.primaryGenre, JSON.stringify(s.star.tagList.slice(0, 5)),
  JSON.stringify(s.members.map((m) => m.appid)));
const insGal = db.prepare(
  'INSERT OR REPLACE INTO galaxies(galaxy_id,name,theme,main_genres,systems) VALUES(?,?,?,?,?)');
for (const [id, name, keys] of activeGalaxies) insGal.run(id, name, name,
  JSON.stringify(keys), JSON.stringify(systems.filter((s) => s.star.galaxy === id).map((s) => s.id)));
db.exec('COMMIT');
console.log('DONE build-universe →', path.join(outDir, 'universe.json'));
