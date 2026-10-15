import { useEffect, useState } from 'react';
import { resolveAsr } from '@/lib/asr/providers';
import { watchTranscription, type AsrProgress } from '@/lib/asr/transcribe';
import type { Settings } from '@/lib/settings';
import { getTranscript } from '@/lib/transcript';
import type { SubtitleAvailability, SubtitleStatus, VideoRef } from '@/lib/types';

export function useSubtitleStatus(video: VideoRef | undefined, settings: Settings | undefined): SubtitleStatus {
  const [availability, setAvailability] = useState<SubtitleAvailability>();
  const [progress, setProgress] = useState<AsrProgress>();
  const key = video && `${video.bvid}:${video.cid}`;
  const canTranscribe = !!settings && !!resolveAsr(settings.asr);

  useEffect(() => {
    setProgress(undefined);
    return video && watchTranscription(video, setProgress);
  }, [key]);

  // Checked again when a transcription ends: it may have produced the subtitles.
  const running = !!progress;
  useEffect(() => {
    setAvailability(undefined);
    if (!video || !settings || running) return;
    let current = true;
    void getTranscript(video)
      .then((transcript) => current && setAvailability(transcript ? 'ready' : canTranscribe ? 'transcribe' : 'off'))
      // Unknown; transcribing would get subtitles all the same. Asking reports the error.
      .catch(() => current && canTranscribe && setAvailability('transcribe'));
    return () => {
      current = false;
    };
  }, [key, !!settings, canTranscribe, running]);

  return progress ? { progress } : availability;
}
