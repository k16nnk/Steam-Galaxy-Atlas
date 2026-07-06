// SteamSpy "all" ページ0–9 (所有者数上位 ~10,000件) を取得しSQLiteへ。
// レジューム対応: 7日以内に取得済みのページはスキップ。allは60秒/リクエスト。
import { openDb, fetchJsonRetry, sleep, nowIso, isFresh } from './lib.js';

const db = openDb();
const PAGES = +(process.env.PAGES || 10);
const getMeta = db.prepare('SELECT value FROM meta WHERE key = ?');
const setMeta = db.prepare(
  'INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
const upsert = db.prepare(`INSERT INTO raw_steamspy_all(appid,page,json,fetched_at)
  VALUES(?,?,?,?) ON CONFLICT(appid) DO UPDATE SET
  page=excluded.page, json=excluded.json, fetched_at=excluded.fetched_at`);

for (let page = 0; page < PAGES; page++) {
  if (isFresh(getMeta.get(`steamspy_page_${page}`)?.value)) {
    console.log(`page ${page}: fresh, skip`);
    continue;
  }
  console.log(`page ${page}: fetching...`);
  const r = await fetchJsonRetry(
    `https://steamspy.com/api.php?request=all&page=${page}`, 5, 15000);
  if (!r.ok) { console.error(`page ${page} FAILED`, r); process.exit(1); }
  const apps = Object.values(r.data);
  const now = nowIso();
  db.exec('BEGIN');
  for (const a of apps) upsert.run(a.appid, page, JSON.stringify(a), now);
  db.exec('COMMIT');
  setMeta.run(`steamspy_page_${page}`, now);
  console.log(`page ${page}: ${apps.length} apps saved`);
  if (page < PAGES - 1) await sleep(61_000);
}
console.log('DONE steamspy all');
