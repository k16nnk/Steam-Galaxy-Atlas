// ブラウザ経由で保存した data/raw/ 以下のJSONをSQLiteへ取り込む。
//   - steamspy_page_*.json → raw_steamspy_all
//   - spy/{appid}.json     → raw_steamspy_detail
//   node pipeline/import-raw.js
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { openDb, DATA_DIR, nowIso } from './lib.js';

const rawDir = path.join(DATA_DIR, 'raw');
const db = openDb();
const upsert = db.prepare(`INSERT INTO raw_steamspy_all(appid,page,json,fetched_at,data_source)
  VALUES(?,?,?,?,'steamspy_all_browser') ON CONFLICT(appid) DO UPDATE SET
  page=excluded.page, json=excluded.json, fetched_at=excluded.fetched_at, data_source=excluded.data_source`);
const setMeta = db.prepare(
  'INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');

let files;
try {
  files = readdirSync(rawDir).filter((f) => /^steamspy_page_\d+\.json$/.test(f));
} catch {
  console.error(`not found: ${rawDir} — mkdir -p data/raw して steamspy_page_*.json を置いてください`);
  process.exit(1);
}
if (!files.length) {
  console.error('data/raw/ に steamspy_page_*.json がありません');
  process.exit(1);
}
const now = nowIso();
let total = 0;
db.exec('BEGIN');
for (const f of files.sort()) {
  const page = +f.match(/(\d+)/)[1];
  const apps = Object.values(JSON.parse(readFileSync(path.join(rawDir, f), 'utf8')));
  for (const a of apps) upsert.run(a.appid, page, JSON.stringify(a), now);
  setMeta.run(`steamspy_page_${page}`, now);
  total += apps.length;
  console.log(`${f}: ${apps.length} apps`);
}
db.exec('COMMIT');
console.log(`pages: ${total} apps from ${files.length} pages`);

const spyDir = path.join(rawDir, 'spy');
if (existsSync(spyDir)) {
  const insSpy = db.prepare(`INSERT OR REPLACE INTO raw_steamspy_detail(appid,json,fetched_at,data_source)
    VALUES(?,?,?,'steamspy_appdetails_browser')`);
  const detailFiles = readdirSync(spyDir).filter((f) => /^\d+\.json$/.test(f));
  db.exec('BEGIN');
  for (const f of detailFiles) {
    insSpy.run(+f.replace('.json', ''), readFileSync(path.join(spyDir, f), 'utf8'), now);
  }
  db.exec('COMMIT');
  console.log(`spy details: ${detailFiles.length}`);
}
console.log('DONE import');
