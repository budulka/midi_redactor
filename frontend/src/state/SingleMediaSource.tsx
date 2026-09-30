import { useEffect } from 'react';
import { keepSingleMediaSource } from '../media/singleMediaSource.ts';
import { useAudioTrackApi } from './audioTrackContext.ts';
import { useVideoApi } from './videoContext.ts';

/** Loading a video replaces the audio file and vice versa: only one media file plays at a time. */
export default function SingleMediaSource() {
  const audio = useAudioTrackApi().controller;
  const video = useVideoApi().controller;
  useEffect(() => keepSingleMediaSource([audio, video]), [audio, video]);
  return null;
}
