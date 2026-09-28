import { useEffect } from 'react';
import { useAudioTrackApi } from './audioTrackContext.ts';
import { useTransportApi } from './transportContext.ts';
import { useVideoApi } from './videoContext.ts';

/**
 * Attaches the audio track and the video to the transport, so they follow its position, status
 * and rate. TransportProvider sits above the media providers, hence this separate component.
 */
export default function MediaSyncBridge() {
  const transportApi = useTransportApi();
  const audio = useAudioTrackApi().controller;
  const video = useVideoApi().controller;

  useEffect(() => {
    const detachAudio = transportApi.attachMedia(audio);
    const detachVideo = transportApi.attachMedia(video);
    return () => {
      detachAudio();
      detachVideo();
    };
  }, [transportApi, audio, video]);

  return null;
}
