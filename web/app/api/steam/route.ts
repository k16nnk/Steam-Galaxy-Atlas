// Steamライブラリ取込プロキシ。
// - Vercelの環境変数 STEAM_API_KEY が必要 (未設定なら501)
// - サーバー側には何も保存しない (結果はクライアントのlocalStorageのみ)
// - 公開プロフィールのみ取得可能
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

// 入力: SteamID64 / バニティ名 / プロフィールURL のいずれか
function parseInput(raw: string): { steamid?: string; vanity?: string } {
  const s = raw.trim();
  const mProfile = s.match(/steamcommunity\.com\/profiles\/(\d{17})/);
  if (mProfile) return { steamid: mProfile[1] };
  const mVanity = s.match(/steamcommunity\.com\/id\/([^/?#]+)/);
  if (mVanity) return { vanity: mVanity[1] };
  if (/^\d{17}$/.test(s)) return { steamid: s };
  return { vanity: s };
}

export async function GET(req: NextRequest) {
  const key = process.env.STEAM_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'not_configured' }, { status: 501, headers: noStore });
  }
  const raw = req.nextUrl.searchParams.get('id') || '';
  if (!raw.trim()) {
    return NextResponse.json({ error: 'missing_id' }, { status: 400, headers: noStore });
  }
  try {
    let { steamid, vanity } = parseInput(raw);
    if (!steamid && vanity) {
      const r = await fetch(
        `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${key}&vanityurl=${encodeURIComponent(vanity)}`,
        { cache: 'no-store' });
      const j = await r.json();
      if (j.response?.success !== 1) {
        return NextResponse.json({ error: 'user_not_found' }, { status: 404, headers: noStore });
      }
      steamid = j.response.steamid as string;
    }
    const r2 = await fetch(
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${steamid}&include_played_free_games=1&format=json`,
      { cache: 'no-store' });
    const j2 = await r2.json();
    const games: { appid: number; playtime_forever: number }[] | undefined = j2.response?.games;
    if (!games) {
      return NextResponse.json({ error: 'private_profile' }, { status: 403, headers: noStore });
    }
    return NextResponse.json(
      { steamid, count: games.length, games: games.map((g) => [g.appid, g.playtime_forever]) },
      { headers: noStore });
  } catch {
    return NextResponse.json({ error: 'steam_unreachable' }, { status: 502, headers: noStore });
  }
}
