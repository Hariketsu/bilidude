import { openDB, type DBSchema } from 'idb';
import type { ChunkTranscript } from './asr/providers';
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

type StoredTranscript = Transcript & {
  key: string;
  fetchedAt: number;
  /** Last time a question loaded it; drives cache expiry. */
  usedAt?: number;
};

interface Schema extends DBSchema {
  sessions: { key: string; value: Session; indexes: { updatedAt: number; videoKey: string } };
  /** Keyed by `${bvid}:${cid}`. Videos without subtitles are not stored. */
  transcripts: { key: string; value: StoredTranscript };
  /**
   * Finished ASR chunks, keyed `${bvid}:${cid}:…`, so an interrupted transcription resumes
   * where it stopped. Deleted once the whole transcript is stored.
   */
  asrChunks: { key: string; value: ChunkTranscript & { savedAt?: number } };
}

const db = openDB<Schema>('bilidude', 2, {
  upgrade(database, oldVersion) {
    if (oldVersion < 1) {
      const sessions = database.createObjectStore('sessions', { keyPath: 'id' });
      sessions.createIndex('updatedAt', 'updatedAt');
      sessions.createIndex('videoKey', 'videoKey');
      database.createObjectStore('transcripts', { keyPath: 'key' });
    }
    if (oldVersion < 2) database.createObjectStore('asrChunks');
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
  const stored = await (await db).get('transcripts', key);
  if (stored) void (await db).put('transcripts', { ...stored, usedAt: Date.now() });
  return stored;
}

export async function storeTranscript(key: string, transcript: Transcript) {
  await (await db).put('transcripts', { ...transcript, key, fetchedAt: Date.now() });
}

export async function loadAsrChunk(key: string): Promise<ChunkTranscript | undefined> {
  return (await db).get('asrChunks', key);
}

export async function storeAsrChunk(key: string, chunk: ChunkTranscript) {
  await (await db).put('asrChunks', { ...chunk, savedAt: Date.now() }, key);
}

/** Drops the resume points of a video once its transcript is complete. */
export async function deleteAsrChunks(transcriptKey: string) {
  await (await db).delete('asrChunks', IDBKeyRange.bound(`${transcriptKey}:`, `${transcriptKey}:\uffff`));
}

export interface CacheEntry {
  store: 'transcripts' | 'asrChunks';
  key: string;
  bytes: number;
  usedAt: number;
  /** A saved conversation is about this video; its transcript validates the citations there. */
  inHistory: boolean;
}

const encoder = new TextEncoder();

/** Every cached transcript and ASR chunk with its approximate size (UTF-8 JSON). */
export async function listCacheEntries(): Promise<CacheEntry[]> {
  const database = await db;
  const history = new Set((await database.getAll('sessions')).map((s) => `${s.video.bvid}:${s.video.cid}`));
  const entries: CacheEntry[] = [];
  for (const record of await database.getAll('transcripts')) {
    const bytes = encoder.encode(JSON.stringify(record)).length;
    entries.push({
      store: 'transcripts',
      key: record.key,
      bytes,
      usedAt: record.usedAt ?? record.fetchedAt,
      inHistory: history.has(record.key),
    });
  }
  let cursor = await database.transaction('asrChunks').store.openCursor();
  while (cursor) {
    const key = cursor.key;
    entries.push({
      store: 'asrChunks',
      key,
      bytes: encoder.encode(JSON.stringify(cursor.value)).length,
      usedAt: cursor.value.savedAt ?? 0,
      inHistory: false,
    });
    cursor = await cursor.continue();
  }
  return entries;
}

export async function deleteCacheEntries(entries: CacheEntry[]) {
  const tx = (await db).transaction(['transcripts', 'asrChunks'], 'readwrite');
  await Promise.all([...entries.map((e) => tx.objectStore(e.store).delete(e.key)), tx.done]);
}
