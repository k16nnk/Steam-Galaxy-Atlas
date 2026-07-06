export type BodyType = 'star' | 'planet' | 'moon' | 'asteroid';

export interface Body {
  id: number;
  t: string;
  ty: BodyType;
  p: [number, number, number];
  d: number;              // physical diameter (視認下限はシェーダー側で担保)
  lum: number;            // 0..1
  c: string;              // hex color
  ld?: [number, number, number]; // 恒星方向 (惑星/衛星/小惑星)
  sys?: string;
  gal: string;
  rel?: string;           // release date (ISO)
  dev?: string;
  pub?: string;
  rv?: [number, number];  // [review_count, positive_pct]
  inf: number;            // influence 0..100
  ea?: number;
  tg?: string[];          // top tags (debug関連スコア用)
  pt?: number;            // average playtime (min)
}

export interface Galaxy {
  id: string;
  name: string;
  p: [number, number, number];
  r: number;              // 銀河半径 (ラベルフェード用)
  tags: string[];         // 代表タグ (最大3)
}

export interface Universe {
  generated_at: string;
  counts: Record<string, number>;
  galaxies: Galaxy[];
  systems: { id: string; name: string; star: number; gal: string; p: [number, number, number] }[];
  bodies: Body[];
}

export const headerImage = (id: number) =>
  `https://cdn.akamai.steamstatic.com/steam/apps/${id}/header.jpg`;
export const steamUrl = (id: number) => `https://store.steampowered.com/app/${id}/`;

export function reviewLabel(count: number, pct: number): string {
  if (count < 10) return `評価少数 (${pct}%)`;
  const base = pct >= 95 ? '圧倒的に好評' : pct >= 80 ? '非常に好評'
    : pct >= 70 ? '好評' : pct >= 40 ? '賛否両論' : '不評';
  return `${base} (${pct}%)`;
}
