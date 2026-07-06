// ブラウザ収集スニペット (tools/collect-steamspy-details.js) からの受信API。
// 開発環境専用: SteamSpyがCloudflare保護でNodeから叩けないため、
// ブラウザが同一オリジンで取得したJSONをここへPOSTして data/raw/ に保存する。
import { NextRequest, NextResponse } from 'next/server';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RAW = path.join(process.cwd(), '..', 'data', 'raw');
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const dev = process.env.NODE_ENV === 'development';

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}

// 取得対象 (推定所有者数 上位LIMIT件) − 取得済み = todo を返す
export async function GET(req: NextRequest) {
  if (!dev) return NextResponse.json({ error: 'dev only' }, { status: 403, headers: CORS });
  const limit = +(req.nextUrl.searchParams.get('limit') || 2000);
  mkdirSync(RAW, { recursive: true });
  const targets: { appid: number; mid: number }[] = [];
  for (const f of readdirSync(RAW).filter((f) => /^steamspy_page_\d+\.json$/.test(f))) {
    const apps = Object.values(
      JSON.parse(readFileSync(path.join(RAW, f), 'utf8')),
    ) as { appid: number; owners?: string }[];
    for (const a of apps) {
      const m = String(a.owners || '').replace(/,/g, '').match(/(\d+)\s*\.\.\s*(\d+)/);
      targets.push({ appid: a.appid, mid: m ? (+m[1] + +m[2]) / 2 : 0 });
    }
  }
  targets.sort((a, b) => b.mid - a.mid);
  const top = targets.slice(0, limit);
  const spyDir = path.join(RAW, 'spy');
  mkdirSync(spyDir, { recursive: true });
  const have = new Set(readdirSync(spyDir).map((f) => +f.replace('.json', '')));
  const todo = top.filter((t) => !have.has(t.appid)).map((t) => t.appid);
  return NextResponse.json(
    { todo, total: top.length, have: have.size },
    { headers: CORS },
  );
}

export async function POST(req: NextRequest) {
  if (!dev) return NextResponse.json({ error: 'dev only' }, { status: 403, headers: CORS });
  let body: { kind?: string; appid?: number; page?: number; data?: unknown };
  try {
    body = JSON.parse(await req.text());
  } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers: CORS });
  }
  if (body.kind === 'spy_detail' && body.appid && body.data) {
    const spyDir = path.join(RAW, 'spy');
    mkdirSync(spyDir, { recursive: true });
    writeFileSync(path.join(spyDir, `${body.appid}.json`), JSON.stringify(body.data));
  } else if (body.kind === 'all' && body.page != null && body.data) {
    mkdirSync(RAW, { recursive: true });
    writeFileSync(path.join(RAW, `steamspy_page_${body.page}.json`), JSON.stringify(body.data));
  } else {
    return NextResponse.json({ ok: false }, { status: 400, headers: CORS });
  }
  return NextResponse.json({ ok: true }, { headers: CORS });
}
