import { fireEvent, render, screen } from '@testing-library/react';
import ProjectProvider from '../state/ProjectProvider.tsx';
import { useHistoryApi } from '../state/historyContext.ts';
import { useProject } from '../state/projectContext.ts';
import type { Project } from '../state/types.ts';
import TempoControls from './TempoControls.tsx';

function ProjectProbe() {
  const { bpm, timeSignature } = useProject();
  return (
    <span data-testid="probe">{`${bpm} ${timeSignature.numerator}/${timeSignature.denominator}`}</span>
  );
}

function renderControls(initialProject?: Project) {
  render(
    <ProjectProvider initialProject={initialProject}>
      <TempoControls />
      <ProjectProbe />
    </ProjectProvider>,
  );
  return {
    tempo: screen.getByLabelText<HTMLInputElement>('Tempo (quarter notes per minute)'),
    numerator: screen.getByLabelText<HTMLInputElement>('Time signature numerator'),
    denominator: screen.getByLabelText<HTMLSelectElement>('Time signature denominator'),
    probe: screen.getByTestId('probe'),
  };
}

function commit(input: HTMLInputElement, value: string) {
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

describe('TempoControls', () => {
  it('shows the tempo field', () => {
    const { tempo } = renderControls();
    expect(screen.getByText(/♩ =/)).toBeInTheDocument();
    expect(tempo.value).toBe('120');
  });

  it('sets the tempo and shows the clamped value', () => {
    const { tempo, probe } = renderControls();
    commit(tempo, '90');
    expect(probe).toHaveTextContent('90 4/4');
    commit(tempo, '1000');
    expect(probe).toHaveTextContent('300 4/4');
    expect(tempo.value).toBe('300');
  });

  it('sets the time signature and ignores invalid numerators', () => {
    const { numerator, denominator, probe } = renderControls();
    commit(numerator, '3');
    expect(probe).toHaveTextContent('120 3/4');
    fireEvent.change(denominator, { target: { value: '8' } });
    expect(probe).toHaveTextContent('120 3/8');
    commit(numerator, '0');
    expect(probe).toHaveTextContent('120 3/8');
    expect(numerator.value).toBe('3');
  });

  it('restores the numerator after an invalid value on the default project', () => {
    const { numerator, probe } = renderControls();
    commit(numerator, '0');
    expect(probe).toHaveTextContent('120 4/4');
    expect(numerator.value).toBe('4');
  });

  it('shows the given project', () => {
    const { tempo, numerator, denominator } = renderControls({
      bpm: 90,
      timeSignature: { numerator: 6, denominator: 8 },
      mediaOffset: 0,
      mediaCuts: [],
      notes: [],
      pedals: [],
    });
    expect(tempo.value).toBe('90');
    expect(numerator.value).toBe('6');
    expect(denominator.value).toBe('8');
  });

  it('rescales notes and pedals as one undo step', () => {
    function TimesProbe() {
      const { notes, pedals } = useProject();
      const history = useHistoryApi();
      const [note] = notes;
      const [pedal] = pedals;
      return (
        <>
          <span data-testid="times">{`${note.start}/${note.duration} ${pedal.start}-${pedal.end}`}</span>
          <button type="button" onClick={history.undo}>
            undo
          </button>
          <button type="button" onClick={history.redo}>
            redo
          </button>
        </>
      );
    }
    render(
      <ProjectProvider
        initialProject={{
          bpm: 120,
          timeSignature: { numerator: 4, denominator: 4 },
          mediaOffset: 0,
          mediaCuts: [],
          notes: [{ id: 'a', pitch: 60, start: 1, duration: 0.5, velocity: 100 }],
          pedals: [{ id: 'p', type: 'sustain', start: 1, end: 2 }],
        }}
      >
        <TempoControls />
        <TimesProbe />
      </ProjectProvider>,
    );
    const tempo = screen.getByLabelText<HTMLInputElement>('Tempo (quarter notes per minute)');
    const times = screen.getByTestId('times');

    fireEvent.change(tempo, { target: { value: '60' } });
    expect(times).toHaveTextContent('1/0.5 1-2');

    fireEvent.keyDown(tempo, { key: 'Enter' });
    expect(times).toHaveTextContent('2/1 2-4');
    expect(tempo.value).toBe('60');

    fireEvent.click(screen.getByRole('button', { name: 'undo' }));
    expect(times).toHaveTextContent('1/0.5 1-2');
    expect(tempo.value).toBe('120');

    fireEvent.click(screen.getByRole('button', { name: 'redo' }));
    expect(times).toHaveTextContent('2/1 2-4');
    expect(tempo.value).toBe('60');
  });
});
