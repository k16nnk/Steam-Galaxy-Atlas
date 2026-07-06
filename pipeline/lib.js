import { DatabaseSync } from 'node:sqlite';
import { execFile } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'data');
mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(path.join(DATA_DIR, 'logs'), { recursive: true });

// ネットワークマウント等でSQLiteが使えない環境では ATLAS_DB でローカルパスを指定
export const DB_PATH = process.env.ATLAS_DB || path.join(DATA_DIR, 'atlas.db');

export function openDb() {
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS raw_steamspy_all (
      appid INTEGER PRIMARY KEY, page INTEGER, json TEXT,
      fetched_at TEXT, data_source TEXT DEFAULT 'steamspy_all');
    CREATE TABLE IF NOT EXISTS raw_steamspy_detail (
      appid INTEGER PRIMARY KEY, json TEXT,
      fetched_at TEXT, data_source TEXT DEFAULT 'steamspy_appdetails');
    CREATE TABLE IF NOT EXISTS raw_store_detail (
      appid INTEGER PRIMARY KEY, json TEXT, success INTEGER,
      fetched_at TEXT, data_source TEXT DEFAULT 'steam_store_appdetails');
    CREATE TABLE IF NOT EXISTS games (
      appid INTEGER PRIMARY KEY, title TEXT, type TEXT,
      genre TEXT, tags TEXT, series_name TEXT, developer TEXT, publisher TEXT,
      release_date TEXT, review_positive INTEGER, review_negative INTEGER,
      review_score REAL, review_count INTEGER,
      estimated_owners_min INTEGER, estimated_owners_max INTEGER, estimated_owners_mid INTEGER,
      ccu INTEGER, average_playtime INTEGER, median_playtime INTEGER,
      price REAL, is_free INTEGER, capsule_image TEXT, header_image TEXT, steam_url TEXT,
      influence_score REAL, diameter REAL, gravity REAL, luminosity REAL, color TEXT,
      galaxy_id TEXT, system_id TEXT, orbit_parent_id INTEGER,
      position_x REAL, position_y REAL, position_z REAL,
      data_source TEXT, fetched_at TEXT);
    CREATE TABLE IF NOT EXISTS systems (
      system_id TEXT PRIMARY KEY, name TEXT, center_appid INTEGER,
      system_type TEXT, main_genre TEXT, representative_tags TEXT, members TEXT);
    CREATE TABLE IF NOT EXISTS galaxies (
      galaxy_id TEXT PRIMARY KEY, name TEXT, theme TEXT, main_genres TEXT, systems TEXT);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
  `);
  return db;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const nowIso = () => new Date().toISOString();
export const isFresh = (iso, days = 7) =>
  !!iso && Date.now() - Date.parse(iso) < days * 864e5;

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Nodeのfetchだけ403になる環境向けフォールバック (curlはTLSフィンガープリントが異なる)
function curlJson(url) {
  return new Promise((resolve) => {
    execFile(
      'curl',
      ['-s', '-L', '-m', '90', '-A', UA, '-H', 'Accept: application/json', url],
      { maxBuffer: 64 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout) return resolve(null);
        try { resolve(JSON.parse(stdout)); } catch { resolve(null); }
      },
    );
  });
}

export async function fetchJsonRetry(url, tries = 5, baseDelay = 5000) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (res.status === 429 || res.status >= 500) throw new Error('HTTP ' + res.status);
      if (res.status === 403) {
        const viaCurl = await curlJson(url);
        if (viaCurl) return { ok: true, data: viaCurl };
        return { ok: false, status: 403 };
      }
      if (!res.ok) return { ok: false, status: res.status };
      return { ok: true, data: await res.json() };
    } catch (e) {
      if (i === tries - 1) return { ok: false, error: String(e) };
      await sleep(baseDelay * 2 ** i);
    }
  }
}

// SteamSpy owners: "1,000,000 .. 2,000,000"
export function parseOwners(s) {
  const m = String(s || '').replace(/,/g, '').match(/(\d+)\s*\.\.\s*(\d+)/);
  if (!m) return { min: null, max: null, mid: null };
  const min = +m[1], max = +m[2];
  return { min, max, mid: Math.round((min + max) / 2) };
}

// Wilson score lower bound (好評率の信頼下限)
export function wilson(pos, n, z = 1.96) {
  if (!n) return 0;
  const p = pos / n, z2 = z * z;
  return (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / (1 + z2 / n);
}

export function quantile(xs, q) {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return 1;
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] || 1;
}

// log正規化 (P99基準, 0..1)
export const nlog = (x, max) =>
  Math.min(1, Math.log10((x || 0) + 1) / Math.log10((max || 1) + 1));

// タグ集合のJaccard類似度
export const jaccard = (a, b) => {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
};

/* ゲームペアの関連スコア (0..1) と内訳。星系メンバー判定とデバッグ両方で使用。
   influence近接は意図的に重み0 (人気が近い≠内容が近い)。 */
const simLog = (x, y) => (x && y
  ? 1 - Math.min(1, Math.abs(Math.log10(x + 1) - Math.log10(y + 1)) / 2) : 0);
export function relation(a, b) {
  const sharedTags = a.tagList.filter((t) => b.tagSet.has(t));
  const tagSim = jaccard(a.tagSet, b.tagSet);
  const ga = new Set(a.genreStr.split(',').map((s) => s.trim()).filter(Boolean));
  const gb = new Set(b.genreStr.split(',').map((s) => s.trim()).filter(Boolean));
  const sharedGenres = [...ga].filter((x) => gb.has(x));
  const genreSim = ga.size && gb.size ? sharedGenres.length / Math.max(ga.size, gb.size) : 0;
  const series = !!(a.seriesKey && a.seriesKey === b.seriesKey);
  const dev = !!(a.developer && a.developer === b.developer);
  const pub = !!(a.publisher && a.publisher === b.publisher);
  const playSim = simLog(a.average_forever, b.average_forever);
  const reviewSim = a.review_pct != null && b.review_pct != null
    ? 1 - Math.abs(a.review_pct - b.review_pct) / 100 : 0;
  const score = Math.min(1,
    0.40 * tagSim + 0.15 * genreSim + (series ? 0.25 : 0)
    + (dev ? 0.12 : 0) + (pub ? 0.05 : 0) + 0.02 * playSim + 0.01 * reviewSim);
  return { score, tagSim, sharedTags, genreSim, sharedGenres, series, dev, pub, playSim, reviewSim };
}

// シード付き決定的乱数
// 注意: appidのような構造的なシードではmulberry32の初期出力が強く相関するため、
// splitmix32を2回通してシードを完全に拡散させる (実測で一様性を確認済み)。
function splitmix32(a) {
  a |= 0; a = (a + 0x9e3779b9) | 0;
  let t = a ^ (a >>> 16);
  t = Math.imul(t, 0x21f0aaad);
  t = t ^ (t >>> 15);
  t = Math.imul(t, 0x735a2d97);
  return (t ^ (t >>> 15)) >>> 0;
}
export function mulberry32(seed) {
  let a = splitmix32(splitmix32(seed));
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
