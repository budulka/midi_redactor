import type { MediaTrackSnapshot } from '../media/MediaTrackController.ts';
import { useAudioTrackApi, useAudioTrackState } from '../state/audioTrackContext.ts';
import { useVideoApi, useVideoState } from '../state/videoContext.ts';

export interface ShownMedia {
  /** True while a video is loaded instead of an audio file: the track shows its sound. */
  readonly showsVideo: boolean;
  readonly state: MediaTrackSnapshot;
  /** Live media time of the shown media, seconds. */
  readonly getCurrentTime: () => number;
}

/**
 * The media drawn on the audio track: the audio file, or the video's sound when a video is
 * loaded instead (only one media file is loaded at a time).
 */
export function useShownMedia(): ShownMedia {
  const audio = useAudioTrackState();
  const video = useVideoState();
  const audioApi = useAudioTrackApi();
  const videoApi = useVideoApi();
  const showsVideo = audio.status === 'empty' && video.status !== 'empty';
  return {
    showsVideo,
    state: showsVideo ? video : audio,
    getCurrentTime: showsVideo ? videoApi.getCurrentTime : audioApi.getCurrentTime,
  };
}
