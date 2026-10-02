import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { PianoEngine } from '../audio/engine.ts';
import { loadPianoEngine } from '../audio/loadEngine.ts';
import { Transport } from '../audio/Transport.ts';
import { MediaSync } from '../media/MediaSync.ts';
import { normalizeMediaOffset } from './normalize.ts';
import { useProject } from './projectContext.ts';
import { useMediaTimeMap } from './useMediaTimeMap.ts';
import { MediaDurationContext } from './timelineContext.ts';
import {
  LIVE_VELOCITY,
  TransportApiContext,
  TransportStateContext,
  type EngineStatus,
  type TransportApi,
  type TransportState,
} from './transportContext.ts';

interface TransportProviderProps {
  children: ReactNode;
  loadEngine?: () => Promise<PianoEngine>;
}

/** Rejection used when an engine finished loading after the provider was unmounted. */
class StaleEngineError extends Error {
  constructor() {
    super('Piano engine was loaded after the transport was disposed');
  }
}

const ignore = () => undefined;

/**
 * Owns the playback Transport, the piano engine and the synchronization of the media with the
 * transport. The engine (Tone.js and the samples) is loaded on the first Play or keyboard press,
 * because browsers only allow audio after a gesture.
 */
export default function TransportProvider({
  children,
  loadEngine = loadPianoEngine,
}: TransportProviderProps) {
  const project = useProject();
  const [transport] = useState(() => new Transport());
  const [mediaSync] = useState(() => new MediaSync(transport));
  const snapshot = useSyncExternalStore(transport.subscribe, transport.getSnapshot);
  const mediaDuration = useSyncExternalStore(mediaSync.subscribe, mediaSync.getMediaDuration);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('idle');
  const [engineError, setEngineError] = useState<string | null>(null);

  const loadEngineRef = useRef(loadEngine);
  const engineRef = useRef<PianoEngine | null>(null);
  const loadingRef = useRef<Promise<PianoEngine> | null>(null);
  const heldRef = useRef(new Set<number>());
  const disposedRef = useRef(false);
  const generationRef = useRef(0);

  useLayoutEffect(() => {
    loadEngineRef.current = loadEngine;
  }, [loadEngine]);

  useEffect(() => {
    transport.setProject(project);
  }, [transport, project]);

  // The project is the source of truth for the offset and the cuts: undo, redo and imports
  // reach the media.
  const timeMap = useMediaTimeMap();
  useEffect(() => {
    mediaSync.setTimeMap(timeMap);
  }, [mediaSync, timeMap]);

  useEffect(() => {
    transport.setMediaDuration(mediaDuration);
  }, [transport, mediaDuration]);

  useEffect(() => {
    disposedRef.current = false;
    const held = heldRef.current;
    return () => {
      disposedRef.current = true;
      generationRef.current += 1;
      loadingRef.current = null;
      held.clear();
      transport.stop();
      // After stop(), so the media has been paused at the start by the synchronization.
      mediaSync.detachAll();
      engineRef.current?.dispose();
      engineRef.current = null;
      transport.setEngine(null);
      setEngineStatus('idle');
      setEngineError(null);
    };
  }, [transport, mediaSync]);

  const api = useMemo<TransportApi>(() => {
    const ensureEngine = (): Promise<PianoEngine> => {
      const engine = engineRef.current;
      if (engine !== null) {
        void engine.resume();
        return Promise.resolve(engine);
      }
      if (loadingRef.current !== null) return loadingRef.current;
      const generation = generationRef.current;
      const isStale = () => disposedRef.current || generation !== generationRef.current;
      setEngineStatus('loading');
      setEngineError(null);
      const loading = loadEngineRef.current().then(
        (loaded) => {
          if (isStale()) {
            loaded.dispose();
            throw new StaleEngineError();
          }
          loadingRef.current = null;
          engineRef.current = loaded;
          transport.setEngine(loaded);
          setEngineStatus('ready');
          return loaded;
        },
        (error: unknown) => {
          if (isStale()) throw new StaleEngineError();
          loadingRef.current = null;
          setEngineStatus('error');
          setEngineError(error instanceof Error ? error.message : String(error));
          throw error;
        },
      );
      loadingRef.current = loading;
      return loading;
    };

    return {
      togglePlay() {
        if (transport.getSnapshot().status === 'playing') {
          transport.pause();
          return;
        }
        const engine = engineRef.current;
        if (engine !== null) {
          void engine.resume();
          transport.play();
          return;
        }
        if (loadingRef.current !== null) return;
        ensureEngine().then(() => transport.play(), ignore);
      },
      stop: () => transport.stop(),
      seek: (position) => transport.seek(position),
      getPosition: () => transport.getPosition(),
      setRate: (rate) => transport.setRate(rate),
      attachMedia: (track) => mediaSync.attach(track),
      applyMediaOffset(offset, seekTo) {
        if (!Number.isFinite(offset)) return;
        mediaSync.batch(() => {
          mediaSync.setTimeMap({
            offset: normalizeMediaOffset(offset),
            cuts: mediaSync.getTimeMap().cuts,
          });
          if (seekTo !== undefined) transport.seek(seekTo);
        });
      },
      noteOn(pitch) {
        heldRef.current.add(pitch);
        const engine = engineRef.current;
        if (engine !== null) {
          void engine.resume();
          engine.attack('live', pitch, LIVE_VELOCITY, engine.now());
          return;
        }
        ensureEngine().then((loaded) => {
          if (heldRef.current.has(pitch)) {
            loaded.attack('live', pitch, LIVE_VELOCITY, loaded.now());
          }
        }, ignore);
      },
      noteOff(pitch) {
        heldRef.current.delete(pitch);
        const engine = engineRef.current;
        if (engine !== null) engine.release('live', pitch, engine.now());
      },
      retry() {
        ensureEngine().catch(ignore);
      },
    };
  }, [transport, mediaSync]);

  const state = useMemo<TransportState>(
    () => ({
      status: snapshot.status,
      position: snapshot.position,
      rate: snapshot.rate,
      engineStatus,
      engineError,
    }),
    [snapshot, engineStatus, engineError],
  );

  return (
    <TransportStateContext.Provider value={state}>
      <TransportApiContext.Provider value={api}>
        <MediaDurationContext.Provider value={mediaDuration}>
          {children}
        </MediaDurationContext.Provider>
      </TransportApiContext.Provider>
    </TransportStateContext.Provider>
  );
}
