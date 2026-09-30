import { setMediaOffset } from '../state/actions.ts';
import { MAX_MEDIA_OFFSET, MEDIA_OFFSET_STEP, MIN_MEDIA_OFFSET } from '../state/constants.ts';
import { normalizeMediaOffset } from '../state/normalize.ts';
import { useProject, useProjectDispatch } from '../state/projectContext.ts';
import { useTransportApi } from '../state/transportContext.ts';
import { mediaOffsetDescription } from '../utils/mediaOffset.ts';
import CommitNumberInput from './CommitNumberInput.tsx';
import { useShownMedia } from './useShownMedia.ts';

/**
 * The media offset (the media second at bar 1): a number field, and a button that makes the
 * current media position bar 1.
 */
export default function MediaOffsetControls() {
  const { mediaOffset } = useProject();
  const dispatch = useProjectDispatch();
  const transportApi = useTransportApi();
  const shown = useShownMedia();
  const ready = shown.state.status === 'ready';

  const setHere = () => {
    const offset = normalizeMediaOffset(shown.getCurrentTime());
    // The media stays on its frame: the offset and the seek to bar 1 reach it in one pass.
    transportApi.applyMediaOffset(offset, 0);
    dispatch(setMediaOffset(offset));
  };

  return (
    <div className="media-offset" role="group" aria-label="Media offset">
      <label className="media-offset__field">
        Bar 1 at{' '}
        <CommitNumberInput
          className="media-offset__input"
          label="Media offset (seconds)"
          value={mediaOffset}
          min={MIN_MEDIA_OFFSET}
          max={MAX_MEDIA_OFFSET}
          step={MEDIA_OFFSET_STEP}
          onCommit={(value) => dispatch(setMediaOffset(value))}
        />{' '}
        s
      </label>
      <button
        type="button"
        aria-label="Set bar 1 to the current media position"
        disabled={!ready}
        onClick={setHere}
      >
        Bar 1 here
      </button>
      <span className="media-offset__hint">{mediaOffsetDescription(mediaOffset)}</span>
    </div>
  );
}
