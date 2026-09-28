import { useEditor } from '../../state/editorContext.ts';
import { useProject } from '../../state/projectContext.ts';

/** Test helper: prints project notes and editor state for assertions. */
export default function StateProbe() {
  const project = useProject();
  const editor = useEditor();
  return (
    <>
      <pre data-testid="notes">{JSON.stringify(project.notes)}</pre>
      <pre data-testid="editor">{JSON.stringify(editor)}</pre>
    </>
  );
}
