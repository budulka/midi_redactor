import { removeNotes, updateNotes } from '../../state/actions.ts';
import { MAX_VELOCITY, MIN_VELOCITY } from '../../state/constants.ts';
import { useEditor, useEditorDispatch } from '../../state/editorContext.ts';
import { clearSelection, selectedNotes } from '../../state/editorState.ts';
import { useProject, useProjectDispatch } from '../../state/projectContext.ts';
import { pitchName } from '../../utils/pitch.ts';
import { secondsToBarPosition } from '../../utils/time.ts';
import CommitNumberInput from '../CommitNumberInput.tsx';

/** Details of the selected note(s): position, duration, velocity and deletion. */
export default function NoteInspector() {
  const { notes, bpm, timeSignature } = useProject();
  const { selectedNoteIds } = useEditor();
  const projectDispatch = useProjectDispatch();
  const editorDispatch = useEditorDispatch();
  const selected = selectedNotes(notes, selectedNoteIds);

  if (selected.length === 0) {
    return (
      <div className="note-inspector" aria-label="Note inspector" role="group">
        <span className="note-inspector__empty">No note selected</span>
      </div>
    );
  }

  const first = selected[0];
  const single = selected.length === 1;
  const position = secondsToBarPosition(first.start, bpm, timeSignature);

  function commitVelocity(velocity: number) {
    projectDispatch(updateNotes(selected.map((note) => ({ id: note.id, patch: { velocity } }))));
  }

  function deleteSelected() {
    projectDispatch(removeNotes(selected.map((note) => note.id)));
    editorDispatch(clearSelection());
  }

  return (
    <div className="note-inspector" aria-label="Note inspector" role="group">
      {single ? (
        <>
          <span className="note-inspector__pitch">{pitchName(first.pitch)}</span>
          <span>{`bar ${position.bar}, beat ${position.beat}`}</span>
          <span>{`${first.duration.toFixed(3)} s`}</span>
        </>
      ) : (
        <span>{`${selected.length} notes selected`}</span>
      )}
      <label className="note-inspector__velocity">
        Velocity{' '}
        <CommitNumberInput
          className="note-inspector__input"
          label="Velocity"
          value={first.velocity}
          min={MIN_VELOCITY}
          max={MAX_VELOCITY}
          step={1}
          onCommit={commitVelocity}
        />
      </label>
      <button type="button" onClick={deleteSelected}>
        {single ? 'Delete note' : 'Delete notes'}
      </button>
    </div>
  );
}
