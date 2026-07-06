// デバッグ用: クライアント側の関連スコア近似 (pipeline/lib.js の relation と同思想)。
// universe.json には top8タグしか無いため tagSim は近似値。genre類似は含まない。
import type { Body } from './types';

const normTitle = (t: string) => t.toLowerCase().replace(/[®™©]/g, '')
  .replace(/:\s.*$|\s[-–—]\s.*$/, '').replace(/\s+\d+\s*$/, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export function relationApprox(a: Body, b: Body) {
  const ta = a.tg ?? [], tb = new Set(b.tg ?? []);
  const sharedTags = ta.filter((t) => tb.has(t));
  const union = new Set([...ta, ...(b.tg ?? [])]).size;
  const tagSim = union ? sharedTags.length / union : 0;
  const series = !!normTitle(a.t) && normTitle(a.t) === normTitle(b.t);
  const dev = !!(a.dev && a.dev === b.dev);
  const pub = !!(a.pub && a.pub === b.pub);
  const playSim = a.pt && b.pt
    ? 1 - Math.min(1, Math.abs(Math.log10(a.pt + 1) - Math.log10(b.pt + 1)) / 2) : 0;
  const reviewSim = a.rv && b.rv ? 1 - Math.abs(a.rv[1] - b.rv[1]) / 100 : 0;
  const score = Math.min(1,
    0.40 * tagSim + (series ? 0.25 : 0) + (dev ? 0.12 : 0) + (pub ? 0.05 : 0)
    + 0.02 * playSim + 0.01 * reviewSim);
  return { score, tagSim, sharedTags, series, dev, pub, playSim, reviewSim };
}
