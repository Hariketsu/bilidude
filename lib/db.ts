import { openDB, type DBSchema } from 'idb';
import type { Message, Transcript, VideoRef } from './types';

export interface Session {
  id: string;
  video: VideoRef;
  /** `${bvid}:${p}`, matching what the active tab's URL identifies. */
  videoKey: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

interface Schema extends DBSchema {
  sessions: { key: string; value: Session; indexes: { updatedAt: number; videoKey: string } };
  /** Keyed by `${bvid}:${cid}`. Videos without subtitles are not stored. */
  transcripts: { key: string; value: Transcript & { key: string; fetchedAt: number } };
}

const db = openDB<Schema>('bilidude', 1, {
  upgrade(database) {
    const sessions = database.createObjectStore('sessions', { keyPath: 'id' });
    sessions.createIndex('updatedAt', 'updatedAt');
    sessions.createIndex('videoKey', 'videoKey');
    database.createObjectStore('transcripts', { keyPath: 'key' });
  },
});

export const videoKeyOf = (video: Pick<VideoRef, 'bvid' | 'p'>) => `${video.bvid}:${video.p}`;

export async function saveSession(session: Session) {
  await (await db).put('sessions', session);
}

/** A session as stored; an answer cut off by closing the panel comes back as stopped. */
export async function getSession(id: string): Promise<Session | undefined> {
  const session = await (await db).get('sessions', id);
  if (!session) return undefined;
  return {
    ...session,
    messages: session.messages.map((m) =>
      m.role === 'assistant' && m.status === 'streaming' ? { ...m, status: 'aborted', phase: 'writing' } : m,
    ),
  };
}

/** Newest first. */
export async function listSessions(): Promise<Session[]> {
  return (await (await db).getAllFromIndex('sessions', 'updatedAt')).reverse();
}

export async function latestSessionFor(videoKey: string): Promise<Session | undefined> {
  const sessions = await (await db).getAllFromIndex('sessions', 'videoKey', videoKey);
  const latest = sessions.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  return latest && getSession(latest.id);
}

export async function deleteSession(id: string) {
  await (await db).delete('sessions', id);
}

export async function loadStoredTranscript(key: string): Promise<Transcript | undefined> {
  return (await db).get('transcripts', key);
}

export async function storeTranscript(key: string, transcript: Transcript) {
  await (await db).put('transcripts', { ...transcript, key, fetchedAt: Date.now() });
}
