import { render, screen } from '@testing-library/react';
import ProjectProvider from '../state/ProjectProvider.tsx';
import type { Project } from '../state/types.ts';
import ProjectInfo from './ProjectInfo.tsx';

describe('ProjectInfo', () => {
  it('shows the default project', () => {
    render(
      <ProjectProvider>
        <ProjectInfo />
      </ProjectProvider>,
    );
    expect(screen.getByText('0 notes')).toBeInTheDocument();
  });

  it('shows the given project', () => {
    const project: Project = {
      bpm: 90,
      timeSignature: { numerator: 6, denominator: 8 },
      mediaOffset: 0,
      mediaCuts: [],
      notes: [
        { id: 'a', pitch: 60, start: 0, duration: 1, velocity: 100 },
        { id: 'b', pitch: 64, start: 1, duration: 1, velocity: 100 },
      ],
      pedals: [],
    };
    render(
      <ProjectProvider initialProject={project}>
        <ProjectInfo />
      </ProjectProvider>,
    );
    expect(screen.getByText('2 notes')).toBeInTheDocument();
    expect(screen.getByLabelText('Project')).toHaveTextContent('2 notes');
  });

  it('uses the singular for one note', () => {
    const project: Project = {
      bpm: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      mediaOffset: 0,
      mediaCuts: [],
      notes: [{ id: 'a', pitch: 60, start: 0, duration: 1, velocity: 100 }],
      pedals: [],
    };
    render(
      <ProjectProvider initialProject={project}>
        <ProjectInfo />
      </ProjectProvider>,
    );
    expect(screen.getByText('1 note')).toBeInTheDocument();
  });
});
