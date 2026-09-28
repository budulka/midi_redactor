import { useProject } from '../state/projectContext.ts';

export default function ProjectInfo() {
  const { bpm, timeSignature, notes } = useProject();
  const noteLabel = notes.length === 1 ? 'note' : 'notes';
  return (
    <p className="project-info" aria-label="Project">
      <span>{bpm} BPM</span>
      {' · '}
      <span>
        {timeSignature.numerator}/{timeSignature.denominator}
      </span>
      {' · '}
      <span>
        {notes.length} {noteLabel}
      </span>
    </p>
  );
}
