'use client';

// Game Detail Drawer: 天体シングルクリックで右側に開く小型詳細パネル。
// 常時表示なし・閉じられる・宇宙の視界を塞がない。
import { useMemo } from 'react';
import { useAtlas } from '../lib/store';
import { headerImage, steamUrl, reviewLabel } from '../lib/types';

const fmtOwners = (n: number) =>
  n >= 1e6 ? `~${(n / 1e6).toFixed(1)}M` : `~${Math.round(n / 1000)}k`;

const TYPE_LABEL: Record<string, string> = {
  star: 'Star — 中心的タイトル',
  planet: 'Planet — 関連タイトル',
  moon: 'Moon — DLC・派生',
  asteroid: 'Asteroid — 小規模・低データ',
};

export default function Drawer() {
  const drawerId = useAtlas((s) => s.drawerId);
  const universe = useAtlas((s) => s.universe);
  const bodies = useAtlas((s) => s.bodies);
  const closeDrawer = useAtlas((s) => s.closeDrawer);
  const flyTo = useAtlas((s) => s.flyTo);
  const openDrawer = useAtlas((s) => s.openDrawer);

  const favorites = useAtlas((s) => s.favorites);
  const toggleFavorite = useAtlas((s) => s.toggleFavorite);

  const body = drawerId != null ? bodies.get(drawerId) : undefined;
  const isFav = body ? favorites.includes(body.id) : false;

  const context = useMemo(() => {
    if (!body || !universe) return null;
    return {
      galaxy: universe.galaxies.find((g) => g.id === body.gal)?.name ?? null,
      system: body.sys ? universe.systems.find((s) => s.id === body.sys)?.name ?? null : null,
      similar: (body.nb ?? [])
        .map(([id, score]) => ({ b: bodies.get(id), score }))
        .filter((x): x is { b: NonNullable<typeof x.b>; score: number } => !!x.b),
    };
  }, [body, universe, bodies]);

  if (!body || !context) return null;

  return (
    <div className="drawer">
      <button className="drawer-close" aria-label="close" onClick={closeDrawer}>×</button>
      <img src={headerImage(body.id)} alt="" draggable={false}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
      <div className="drawer-body">
        <div className="drawer-title">
          <h3>{body.t}</h3>
          <button
            className={`drawer-fav${isFav ? ' on' : ''}`}
            title={isFav ? 'お気に入りから外す' : 'お気に入りに登録 (星が金色に灯ります)'}
            onClick={() => toggleFavorite(body.id)}
          >
            {isFav ? '★' : '☆'}
          </button>
        </div>
        <div className="drawer-type">{TYPE_LABEL[body.ty]}</div>

        <div className="drawer-grid">
          {body.rel && <><span>発売日</span><span>{body.rel}</span></>}
          {body.dev && <><span>開発</span><span>{body.dev}</span></>}
          {body.pub && body.pub !== body.dev && <><span>販売</span><span>{body.pub}</span></>}
          {body.rv && <><span>Steam評価</span><span>{reviewLabel(body.rv[0], body.rv[1])}</span></>}
          {body.ow && <><span>推定所有者数</span><span>{fmtOwners(body.ow)} (推定)</span></>}
          {body.pr != null && <><span>価格</span><span>{body.pr === 0 ? 'Free to Play' : `$${body.pr.toFixed(2)}`}</span></>}
          {context.galaxy && <><span>銀河</span><span>{context.galaxy}</span></>}
          {context.system && <><span>星系</span><span>{context.system}</span></>}
          {(body.hg ?? 0) >= 40 && <><span>Hidden Gem</span><span>{body.hg} / 100</span></>}
        </div>

        {body.tg && (
          <div className="drawer-tags">
            {body.tg.slice(0, 6).map((t) => <span key={t}>{t}</span>)}
          </div>
        )}

        {context.similar.length > 0 && (
          <>
            <h4>Similar games</h4>
            {context.similar.map(({ b, score }) => (
              <button key={b.id} className="drawer-similar"
                onClick={() => { openDrawer(b.id); flyTo(b, 'search'); }}>
                <span>{b.t}</span>
                <span>{score}{(b.hg ?? 0) >= 60 ? ' ✦' : ''}</span>
              </button>
            ))}
          </>
        )}

        <a className="drawer-steam" href={steamUrl(body.id)} target="_blank" rel="noopener noreferrer">
          View on Steam ↗
        </a>
      </div>
    </div>
  );
}
