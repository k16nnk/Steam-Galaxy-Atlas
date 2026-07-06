'use client';

import { useEffect, useRef } from 'react';
import { useAtlas } from '../lib/store';
import { screen } from '../lib/screenBus';
import { headerImage, steamUrl, reviewLabel } from '../lib/types';

/* FPS照準風4本線 + ホバーポップアップ (スクリーンスペースDOM) */
export default function Overlay() {
  const hoverId = useAtlas((s) => s.hoverId);
  const focusedId = useAtlas((s) => s.focusedId);
  const bodies = useAtlas((s) => s.bodies);
  const hoverEnter = useAtlas((s) => s.hoverEnter);
  const hoverLeave = useAtlas((s) => s.hoverLeave);

  const retRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLAnchorElement>(null);

  const targetId = hoverId ?? focusedId;
  const body = targetId != null ? bodies.get(targetId) : undefined;
  const popupBody = hoverId != null ? bodies.get(hoverId) : undefined;

  useEffect(() => {
    let raf = 0;
    let conv = 12; // 出現時に外側から寄る
    let lastId = -1;
    const LEN = 10, GAP = 6;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const ret = retRef.current;
      const pop = popRef.current;
      if (!screen.visible) {
        if (ret) ret.style.display = 'none';
        if (pop) pop.style.display = 'none';
        return;
      }
      if (screen.id !== lastId) { conv = 12; lastId = screen.id; }
      conv *= 0.72;
      if (conv < 0.05) conv = 0;
      const gap = screen.r + GAP + conv;
      if (ret) {
        ret.style.display = 'block';
        ret.style.transform = `translate(${screen.x}px, ${screen.y}px)`;
        const [top, bottom, left, right] = Array.from(ret.children) as HTMLElement[];
        top.style.transform = `translate(-0.75px, ${-(gap + LEN)}px)`;
        bottom.style.transform = `translate(-0.75px, ${gap}px)`;
        left.style.transform = `translate(${-(gap + LEN)}px, -0.75px)`;
        right.style.transform = `translate(${gap}px, -0.75px)`;
      }
      if (pop) {
        pop.style.display = 'block';
        const W = 182;
        const H = pop.offsetHeight || 150;
        let x = screen.x + gap + 14;
        if (x + W > window.innerWidth - 8) x = screen.x - gap - 14 - W;
        let y = screen.y - H / 2;
        y = Math.max(8, Math.min(window.innerHeight - H - 8, y));
        pop.style.left = `${x}px`;
        pop.style.top = `${y}px`;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      {body && (
        <div ref={retRef} className="reticle" style={{ display: 'none' }}>
          <span className="v" />
          <span className="v" />
          <span className="h" />
          <span className="h" />
        </div>
      )}
      {popupBody && (
        <a
          ref={popRef}
          className="popup"
          href={steamUrl(popupBody.id)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'none' }}
          onMouseEnter={() => hoverEnter(popupBody.id)}
          onMouseLeave={hoverLeave}
        >
          <img
            src={headerImage(popupBody.id)}
            alt=""
            draggable={false}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
          <div className="body">
            <p className="title">{popupBody.t}</p>
            <div className="meta">
              {popupBody.rel && <div>{popupBody.rel}</div>}
              {popupBody.dev && <div>{popupBody.dev}</div>}
              {popupBody.rv && <div>{reviewLabel(popupBody.rv[0], popupBody.rv[1])}</div>}
            </div>
          </div>
        </a>
      )}
    </>
  );
}
