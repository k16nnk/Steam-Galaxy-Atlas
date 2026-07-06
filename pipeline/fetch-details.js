// 上位LIMIT件の詳細取得。レジューム対応(取得済みはスキップ)。
//   node pipeline/fetch-details.js spy    → SteamSpy appdetails (タグ/ジャンル) 1req/秒
//   node pipeline/fetch-details.js store  → Steam Store appdetails (発売日/type) 1req/1.6秒
import { openDb, fetchJsonRetry, sleep, nowIso, parseOwners } from './lib.js';

const mode = process.argv[2];
if (mode !== 'spy' && mode !== 'store') { console.error('usage: fetch-details.js spy|store'); process.exit(1); }
const LIMIT = +(process.env.LIMIT || 2000);
const db = openDb();

const targets = db.prepare('SELECT appid, json FROM raw_steamspy_all').all()
  .map((r) => {
    const j = JSON.parse(r.json);
    return { appid: r.appid, mid: parseOwners(j.owners).mid ?? 0, ccu: j.ccu ?? 0 };
  })
  .sort((a, b) => b.mid - a.mid || b.ccu - a.ccu)
  .slice(0, LIMIT);

const table = mode === 'spy' ? 'raw_steamspy_detail' : 'raw_store_detail';
const have = new Set(db.prepare(`SELECT appid FROM ${table}`).all().map((r) => r.appid));
const todo = targets.filter((t) => !have.has(t.appid));
console.log(`[${mode}] targets=${targets.length} done=${have.size} todo=${todo.length}`);

const insSpy = db.prepare(
  'INSERT OR REPLACE INTO raw_steamspy_detail(appid,json,fetched_at) VALUES(?,?,?)');
const insStore = db.prepare(
  'INSERT OR REPLACE INTO raw_store_detail(appid,json,success,fetched_at) VALUES(?,?,?,?)');

// Storeレスポンスは必要フィールドのみに削減して保存
const trim = (d) => d && {
  type: d.type, name: d.name, is_free: d.is_free,
  release_date: d.release_date, developers: d.developers, publishers: d.publishers,
  genres: d.genres?.map((g) => g.description), fullgame: d.fullgame,
};

let n = 0;
for (const t of todo) {
  if (mode === 'spy') {
    const r = await fetchJsonRetry(
      `https://steamspy.com/api.php?request=appdetails&appid=${t.appid}`, 4, 10000);
    if (r.ok) insSpy.run(t.appid, JSON.stringify(r.data), nowIso());
    else console.error(`spy ${t.appid} skip`, r.status || r.error);
    await sleep(1000);
  } else {
    const r = await fetchJsonRetry(
      `https://store.steampowered.com/api/appdetails?appids=${t.appid}&cc=us&l=english`, 4, 20000);
    if (r.ok) {
      const entry = r.data?.[t.appid];
      insStore.run(t.appid, JSON.stringify(trim(entry?.data) ?? null),
        entry?.success ? 1 : 0, nowIso());
    } else if (r.status) {
      insStore.run(t.appid, 'null', 0, nowIso()); // 恒久エラーは再取得しない
    } else {
      console.error(`store ${t.appid} transient skip`, r.error);
    }
    await sleep(1600);
  }
  if (++n % 25 === 0) console.log(`[${mode}] ${n}/${todo.length}`);
}
console.log(`DONE ${mode} (${n} fetched)`);
