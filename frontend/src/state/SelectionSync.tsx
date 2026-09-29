import { useEffect } from 'react';
import { useEditorDispatch } from './editorContext.ts';
import { retainSelection } from './editorState.ts';
import { useProject } from './projectContext.ts';

/**
 * Removes ids of notes and pedals that no longer exist (e.g. after undo) from the editor
 * selection. EditorProvider has no access to the project, hence this separate component.
 */
export default function SelectionSync() {
  const { notes, pedals } = useProject();
  const dispatch = useEditorDispatch();

  useEffect(() => {
    dispatch(
      retainSelection(
        notes.map((note) => note.id),
        pedals.map((pedal) => pedal.id),
      ),
    );
  }, [notes, pedals, dispatch]);

  return null;
}
