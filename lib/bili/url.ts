export interface VideoLocation {
  bvid: string;
  /** 1-based part number. */
  p: number;
}

const BVID = /^BV[0-9A-Za-z]{10}$/;

/** Recognizes `/video/BVxxx?p=N` and `/list/...?bvid=BVxxx&p=N`. */
export function parseVideoUrl(url: string | undefined): VideoLocation | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== 'www.bilibili.com') return null;

  const fromPath = parsed.pathname.match(/^\/video\/(BV[0-9A-Za-z]{10})/)?.[1];
  const fromList = parsed.pathname.startsWith('/list/') ? parsed.searchParams.get('bvid') : null;
  const bvid = fromPath ?? fromList;
  if (!bvid || !BVID.test(bvid)) return null;

  const p = Number(parsed.searchParams.get('p'));
  return { bvid, p: Number.isInteger(p) && p > 0 ? p : 1 };
}

export function buildVideoUrl({ bvid, p }: VideoLocation, seconds?: number): string {
  const url = new URL(`https://www.bilibili.com/video/${bvid}/`);
  if (p > 1) url.searchParams.set('p', String(p));
  if (seconds !== undefined) url.searchParams.set('t', String(Math.floor(seconds)));
  return url.toString();
}
