import { setBpm, setTimeSignature } from '../state/actions.ts';
import {
  ALLOWED_DENOMINATORS,
  MAX_BPM,
  MAX_NUMERATOR,
  MIN_BPM,
  MIN_NUMERATOR,
} from '../state/constants.ts';
import { useProject, useProjectDispatch } from '../state/projectContext.ts';
import CommitNumberInput from './CommitNumberInput.tsx';

export default function TempoControls() {
  const { bpm, timeSignature } = useProject();
  const dispatch = useProjectDispatch();

  return (
    <div className="tempo-controls" role="group" aria-label="Tempo and time signature">
      <label className="tempo-controls__tempo">
        ♩ ={' '}
        <CommitNumberInput
          className="tempo-controls__input"
          label="Tempo (quarter notes per minute)"
          value={bpm}
          min={MIN_BPM}
          max={MAX_BPM}
          step={1}
          onCommit={(value) => dispatch(setBpm(value))}
        />
      </label>
      <span className="tempo-controls__signature">
        <CommitNumberInput
          className="tempo-controls__input tempo-controls__input--short"
          label="Time signature numerator"
          value={timeSignature.numerator}
          min={MIN_NUMERATOR}
          max={MAX_NUMERATOR}
          step={1}
          onCommit={(numerator) =>
            dispatch(setTimeSignature({ numerator, denominator: timeSignature.denominator }))
          }
        />
        /
        <select
          aria-label="Time signature denominator"
          value={timeSignature.denominator}
          onChange={(event) =>
            dispatch(
              setTimeSignature({
                numerator: timeSignature.numerator,
                denominator: Number(event.target.value),
              }),
            )
          }
        >
          {ALLOWED_DENOMINATORS.map((denominator) => (
            <option key={denominator} value={denominator}>
              {denominator}
            </option>
          ))}
        </select>
      </span>
    </div>
  );
}
