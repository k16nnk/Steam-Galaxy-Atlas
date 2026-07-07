'use client';

// My Universe: お気に入り・旅の履歴・嗜好プロファイル・Steamライブラリ取込。
// 右からスライドインするシーン。データはすべてローカル(localStorage)のみ。
import { useMemo, useState } from 'react';
import { useAtlas, type HistoryEntry } from '../lib/store';
import type { Body } from '../lib/types';

function tasteTags(bodies: Body[]): string[] {
  const count = new Map<string, number>();
  for (const b of bodies) {
    for (const t of (b.tg ?? []).slice(0, 6)) count.set(t, (count.get(t) ?? 0) + 1);
  }
  return [...count].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t]) => t);
}

export default function MyUniverse() {
  const open = useAtlas((s) => s.myOpen);
  const setMyOpen = useAtlas((s) => s.setMyOpen);
  const universe = useAtlas((s) => s.universe);
  const bodies = useAtlas((s) => s.bodies);
  const favorites = useAtlas((s) => s.favorites);
  const owned = useAtlas((s) => s.owned);
  const ownedId = useAtlas((s) => s.ownedId);
  const mode = useAtlas((s) => s.mode);
  const [steamInput, setSteamInput] = useState('');
  const [importState, setImportState] = useState<'idle' | 'loading' | string>('idle');

  const favBodies = useMemo(
    () => favorites.map((id) => bodies.get(id)).filter((b): b is Body => !!b),
    [favorites, bodies]);

  const history: HistoryEntry[] = useMemo(
    () => (open ? useAtlas.getState().getHistory().slice(0, 12) : []),
    [open]);

  const ownedStats = useMemo(() => {
    if (!owned || !universe) return null;
    const inAtlas: { b: Body; min: number }[] = [];
    for (const b of universe.bodies) {
      const min = owned[b.id];
      if (min != null) inAtlas.push({ b, min });
    }
    inAtlas.sort((a, c) => c.min - a.min);
    const topPlayed = inAtlas.slice(0, 20);
    // おすすめ: よく遊んだゲームのnbから未所持を集計
    const rec = new Map<number, number>();
    for (const { b } of topPlayed) {
      for (const [id, score] of b.nb ?? []) {
        if (owned[id] != null) continue;
        rec.set(id, (rec.get(id) ?? 0) + score);
      }
    }
    const recommendations = [...rec]
      .sort((a, c) => c[1] - a[1]).slice(0, 8)
      .map(([id]) => bodies.get(id)).filter((b): b is Body => !!b);
    return {
      inAtlas: inAtlas.length,
      tags: tasteTags(topPlayed.map((x) => x.b)),
      topPlayed: topPlayed.slice(0, 5),
      recommendations,
    };
  }, [owned, universe, bodies]);

  const taste = useMemo(() => {
    const src = [...favBodies, ...history.map((h) => bodies.get(h.id)).filter((b): b is Body => !!b)];
    return tasteTags(src);
  }, [favBodies, history, bodies]);

  const jump = (b: Body) => {
    const st = useAtlas.getState();
    st.setMyOpen(false);
    st.flyTo(b, 'search');
    st.openDrawer(b.id);
  };

  const doImport = async () => {
    if (!steamInput.trim() || importState === 'loading') return;
    setImportState('loading');
    try {
      const r = await fetch(`/api/steam?id=${encodeURIComponent(steamInput.trim())}`);
      const j = await r.json();
      if (!r.ok) {
        setImportState(
          j.error === 'not_configured' ? 'サーバーにSTEAM_API_KEYが未設定です (Vercelの環境変数に追加してください)'
          : j.error === 'private_profile' ? 'プロフィールが非公開のため取得できません (Steamの設定で「ゲームの詳細」を公開にしてください)'
          : j.error === 'user_not_found' ? 'ユーザーが見つかりません'
          : '取得に失敗しました');
        return;
      }
      const games: Record<number, number> = {};
      for (const [appid, min] of j.games as [number, number][]) games[appid] = min;
      useAtlas.getState().setOwned(j.steamid, games);
      setImportState('idle');
      useAtlas.getState().showToast(`Imported ${j.count} games`);
    } catch {
      setImportState('通信エラー');
    }
  };

  if (!open) return null;
  return (
    <div className="my">
      <div className="my-head">
        <span>MY UNIVERSE</span>
        <button onClick={() => setMyOpen(false)} aria-label="close">×</button>
      </div>

      <h4>Favorites ({favBodies.length})</h4>
      {favBodies.length === 0 && <div className="my-empty">天体の詳細から ☆ で登録すると、その星が金色に灯ります</div>}
      {favBodies.map((b) => (
        <div key={b.id} className="my-row">
          <button className="my-link" onClick={() => jump(b)}>{b.t}</button>
          <button className="my-x" onClick={() => useAtlas.getState().toggleFavorite(b.id)} aria-label="remove">×</button>
        </div>
      ))}

      <h4>Journey log</h4>
      {history.length === 0 && <div className="my-empty">検索やダブルクリックで訪れた星がここに残ります</div>}
      {history.map((h) => {
        const b = bodies.get(h.id);
        return (
          <div key={h.id} className="my-row">
            <button className="my-link" onClick={() => b && jump(b)}>{h.t}</button>
          </div>
        );
      })}

      {taste.length > 0 && (
        <>
          <h4>Your taste</h4>
          <div className="my-tags">{taste.map((t) => <span key={t}>{t}</span>)}</div>
        </>
      )}

      <h4>Steam library</h4>
      {ownedStats ? (
        <>
          <div className="my-note">
            {ownedId} · アトラス内に {ownedStats.inAtlas.toLocaleString()} 本
          </div>
          <div className="my-tags">{ownedStats.tags.map((t) => <span key={t}>{t}</span>)}</div>
          <button
            className={`my-mode${mode === 'mine' ? ' on' : ''}`}
            onClick={() => useAtlas.getState().setMode(mode === 'mine' ? 'explore' : 'mine')}
          >
            {mode === 'mine' ? '✓ 所持ゲームを強調中 (解除)' : '宇宙で所持ゲームを強調する'}
          </button>
          {ownedStats.recommendations.length > 0 && (
            <>
              <h4>Recommended for you</h4>
              {ownedStats.recommendations.map((b) => (
                <div key={b.id} className="my-row">
                  <button className="my-link" onClick={() => jump(b)}>
                    {b.t}{(b.hg ?? 0) >= 60 ? ' ✦' : ''}
                  </button>
                </div>
              ))}
            </>
          )}
        </>
      ) : (
        <>
          <div className="my-empty">
            SteamID・プロフィールURL・バニティ名で所持ゲームを取り込めます (公開プロフィールのみ、保存はこの端末内だけ)
          </div>
          <div className="my-import">
            <input
              value={steamInput}
              placeholder="SteamID or profile URL"
              spellCheck={false}
              onChange={(e) => setSteamInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doImport(); }}
            />
            <button onClick={doImport} disabled={importState === 'loading'}>
              {importState === 'loading' ? '…' : 'Import'}
            </button>
          </div>
          {importState !== 'idle' && importState !== 'loading' && (
            <div className="my-error">{importState}</div>
          )}
        </>
      )}
    </div>
  );
}
