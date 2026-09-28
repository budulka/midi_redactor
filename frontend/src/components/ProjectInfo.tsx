import { useProject } from '../state/projectContext.ts';

export default function ProjectInfo() {
  const { notes } = useProject();
  const noteLabel = notes.length === 1 ? 'note' : 'notes';
  return (
    <p className="project-info" aria-label="Project">
      {notes.length} {noteLabel}
    </p>
  );
}
