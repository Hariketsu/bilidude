// B站 web API. Requests carry the user's login cookies (credentials: 'include'),
// which works from extension pages thanks to the host permissions.

export interface BiliVideoInfo {
  aid: number;
  bvid: string;
  title: string;
  desc: string;
  coverUrl: string;
  upName: string;
  durationSec: number;
  pages: { cid: number; page: number; part: string; durationSec: number }[];
}

export interface BiliSubtitleTrack {
  /** `id_str`; the numeric `id` exceeds 2^53 and loses precision. */
  id: string;
  /** e.g. `zh-CN`, `en-US`, `ai-zh`, `ai-en`. */
  lan: string;
  lanDoc: string;
  url: string;
}

export interface BiliChapter {
  from: number;
  title: string;
}

export interface BiliSubtitleLine {
  from: number;
  to: number;
  content: string;
}

export class BiliApiError extends Error {}

async function biliFetch<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new BiliApiError(`HTTP ${response.status}`);
  const body = await response.json();
  // Subtitle bodies are plain JSON; API responses wrap data in { code, message, data }.
  if (typeof body?.code === 'number') {
    if (body.code !== 0) throw new BiliApiError(body.message || `B站 API error ${body.code}`);
    return body.data as T;
  }
  return body as T;
}

function absoluteUrl(url: string): string {
  if (url.startsWith('//')) return `https:${url}`;
  return url.replace(/^http:/, 'https:');
}

export async function fetchVideoInfo(bvid: string): Promise<BiliVideoInfo> {
  const data = await biliFetch<any>(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
  return {
    aid: data.aid,
    bvid: data.bvid,
    title: data.title,
    desc: data.desc === '-' ? '' : (data.desc ?? ''),
    coverUrl: absoluteUrl(data.pic ?? ''),
    upName: data.owner?.name ?? '',
    durationSec: data.duration,
    pages: (data.pages ?? []).map((page: any) => ({
      cid: page.cid,
      page: page.page,
      part: page.part,
      durationSec: page.duration,
    })),
  };
}

export interface BiliPlayerInfo {
  tracks: BiliSubtitleTrack[];
  chapters: BiliChapter[];
}

/** Subtitle tracks and official chapters (`view_points`) of one part. */
export async function fetchPlayerInfo(aid: number, cid: number, bvid: string): Promise<BiliPlayerInfo> {
  const urls = [
    `https://api.bilibili.com/x/player/wbi/v2?aid=${aid}&cid=${cid}&bvid=${bvid}`,
    `https://api.bilibili.com/x/player/v2?aid=${aid}&cid=${cid}&bvid=${bvid}`,
  ];
  let lastError: unknown;
  for (const url of urls) {
    try {
      const data = await biliFetch<any>(url);
      return {
        tracks: (data.subtitle?.subtitles ?? [])
          .filter((track: any) => track.subtitle_url)
          .map((track: any) => ({
            id: String(track.id_str ?? track.id),
            lan: track.lan ?? '',
            lanDoc: track.lan_doc ?? '',
            url: absoluteUrl(track.subtitle_url),
          })),
        chapters: (data.view_points ?? [])
          .map((point: any) => ({ from: Number(point.from) || 0, title: String(point.content ?? '').trim() }))
          .filter((chapter: BiliChapter) => chapter.title),
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export async function fetchSubtitleBody(url: string): Promise<BiliSubtitleLine[]> {
  const data = await biliFetch<{ body?: BiliSubtitleLine[] }>(url);
  return (data.body ?? []).map(({ from, to, content }) => ({ from, to, content }));
}
