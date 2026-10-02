import { useProject } from '../state/projectContext.ts';
import { cutDescription, cutShadePercent } from '../utils/mediaCuts.ts';
import { useShownMedia } from './useShownMedia.ts';

/**
 * Shades the cut ranges over the waveform of the whole media file, so it is clear which parts the
 * timeline skips. Display only: cuts are edited on the media timeline above the piano roll.
 */
export default function MediaCutsShade() {
  const { mediaCuts } = useProject();
  const { state } = useShownMedia();
  if (state.status !== 'ready' || !(state.duration > 0)) return null;
  return (
    <div className="media-cuts-overlay">
      {mediaCuts.map((cut) => {
        const shade = cutShadePercent(cut, state.duration);
        if (shade === null) return null;
        return (
          <div
            key={cut.id}
            className="media-cuts-overlay__cut"
            style={{ left: `${shade.left}%`, width: `${shade.width}%` }}
            title={cutDescription(cut)}
          />
        );
      })}
    </div>
  );
}
