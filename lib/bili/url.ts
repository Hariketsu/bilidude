export interface VideoLocation {
  bvid: string;
  /** 1-based part number. */
  p: number;
}

const BVID = /^BV[0-9A-Za-z]{10}$/;

// av → BV conversion as done by Bilibili's own player (covers every aid below 2^51).
const XOR_CODE = 23442827791579n;
const MAX_AID = 1n << 51n;
const BASE = 58n;
const ALPHABET = 'FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf';

export function avToBv(aid: bigint): string | null {
  if (aid <= 0n || aid >= MAX_AID) return null;
  const chars = [...'BV1000000000'];
  let i = chars.length - 1;
  for (let n = (MAX_AID | aid) ^ XOR_CODE; n > 0n; n /= BASE) chars[i--] = ALPHABET[Number(n % BASE)]!;
  [chars[3], chars[9]] = [chars[9]!, chars[3]!];
  [chars[4], chars[7]] = [chars[7]!, chars[4]!];
  return chars.join('');
}

/**
 * Recognizes `/video/BVxxx?p=N`, legacy `/video/av123?p=N` and `/list/...?bvid=BVxxx&p=N`.
 * av numbers are converted to BV ids so both URL forms identify the same video.
 */
export function parseVideoUrl(url: string | undefined): VideoLocation | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== 'www.bilibili.com') return null;

  const aid = parsed.pathname.match(/^\/video\/av(\d+)/i)?.[1];
  const fromPath = aid ? avToBv(BigInt(aid)) : parsed.pathname.match(/^\/video\/(BV[0-9A-Za-z]{10})/)?.[1];
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
