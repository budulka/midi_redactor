import { PEDAL_CC, PEDAL_LABELS, PEDAL_TYPES } from '../../state/constants.ts';
import { PEDAL_ROW_HEIGHT_PX } from '../../utils/pedalGeometry.ts';

/** Names of the pedal lane rows, next to the lane; the tooltip shows the MIDI controller. */
export default function PedalLabels() {
  return (
    <div className="pedal-labels">
      {PEDAL_TYPES.map((type) => (
        <div
          key={type}
          className="pedal-labels__label"
          title={`MIDI CC${PEDAL_CC[type]}`}
          style={{ height: PEDAL_ROW_HEIGHT_PX }}
        >
          {PEDAL_LABELS[type]}
        </div>
      ))}
    </div>
  );
}
