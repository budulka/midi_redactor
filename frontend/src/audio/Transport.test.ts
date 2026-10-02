import type { Note, PedalEvent, PedalType, Project } from '../state/types.ts';
import { FakePianoEngine } from './testing/FakePianoEngine.ts';
import { Transport } from './Transport.ts';

function note(id: string, pitch: number, start: number, end: number, velocity = 100): Note {
  return { id, pitch, start, duration: end - start, velocity };
}

function pedal(type: PedalType, start: number, end: number): PedalEvent {
  return { id: `${type}-${start}`, type, start, end };
}

function project(notes: Note[], pedals: PedalEvent[] = []): Project {
  return {
    bpm: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    mediaOffset: 0,
    mediaCuts: [],
    notes,
    pedals,
  };
}

const a = note('a', 60, 0, 0.5, 100);

function setup(notes: Note[] = [a], pedals: PedalEvent[] = []) {
  const engine = new FakePianoEngine();
  const transport = new Transport({ lookaheadSeconds: 0.1 });
  transport.setEngine(engine);
  transport.setProject(project(notes, pedals));
  return { engine, transport };
}

function at(engine: FakePianoEngine, time: number) {
  engine.time = time;
  engine.tick();
}

function round(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.round(value * 1e6) / 1e6;
}

function calls(engine: FakePianoEngine) {
  return engine.calls.map((call) => ({ ...call, time: round(call.time) }));
}

describe('Transport', () => {
  it('cannot play without an engine but can seek', () => {
    const transport = new Transport();
    transport.setProject(project([a]));
    expect(() => transport.play()).toThrow('Piano engine is not loaded');
    transport.seek(2);
    expect(transport.getPosition()).toBe(2);
    expect(transport.getSnapshot().status).toBe('stopped');
    expect(transport.hasEngine()).toBe(false);
  });

  it('schedules attacks and releases ahead of the audio clock', () => {
    const { engine, transport } = setup();
    transport.play();
    expect(calls(engine)).toEqual([
      { op: 'attack', channel: 'playback', pitch: 60, velocity: 100, time: 0.05 },
    ]);
    expect(transport.getSnapshot().status).toBe('playing');
    expect(engine.activeTickers).toBe(1);

    at(engine, 0.4);
    expect(engine.calls).toHaveLength(1);
    at(engine, 0.5);
    expect(calls(engine)[1]).toEqual({ op: 'release', channel: 'playback', pitch: 60, time: 0.55 });
  });

  it('reports the live position', () => {
    const { engine, transport } = setup();
    transport.play();
    engine.time = 0.02;
    expect(transport.getPosition()).toBe(0);
    engine.time = 1.05;
    expect(transport.getPosition()).toBeCloseTo(1);
  });

  it('pauses and resumes from the pause position', () => {
    const { engine, transport } = setup();
    transport.play();
    at(engine, 1.05);
    const before = engine.calls.length;
    transport.pause();
    expect(calls(engine).slice(before)).toEqual([
      { op: 'releaseAll', channel: 'playback', time: 1.05 },
    ]);
    expect(engine.activeTickers).toBe(0);
    expect(transport.getSnapshot().status).toBe('paused');
    expect(transport.getSnapshot().position).toBeCloseTo(1);

    const attacks = engine.calls.filter((call) => call.op === 'attack').length;
    engine.time = 2;
    transport.play();
    at(engine, 2.3);
    expect(engine.calls.filter((call) => call.op === 'attack')).toHaveLength(attacks);
    engine.time = 2.55;
    expect(transport.getPosition()).toBeCloseTo(1.5);
  });

  it('stops and returns to the start, also when paused', () => {
    const { engine, transport } = setup();
    transport.play();
    engine.time = 1.05;
    transport.stop();
    expect(engine.calls.at(-1)).toMatchObject({ op: 'releaseAll', channel: 'playback' });
    expect(transport.getSnapshot()).toEqual({ status: 'stopped', position: 0, rate: 1 });
    expect(engine.activeTickers).toBe(0);

    transport.play();
    engine.time = 2;
    transport.pause();
    expect(transport.getSnapshot().position).toBeGreaterThan(0);
    transport.stop();
    expect(transport.getSnapshot()).toEqual({ status: 'stopped', position: 0, rate: 1 });
  });

  it('seeks during playback and keeps playing from there', () => {
    const { engine, transport } = setup();
    transport.play();
    at(engine, 1.05);
    const before = engine.calls.length;
    transport.seek(0);
    expect(calls(engine).slice(before)).toEqual([
      { op: 'releaseAll', channel: 'playback', time: 1.05 },
      { op: 'attack', channel: 'playback', pitch: 60, velocity: 100, time: 1.1 },
    ]);
    expect(transport.getSnapshot().status).toBe('playing');
    expect(engine.activeTickers).toBe(1);
  });

  it('releases a note at the end of the sustain pedal', () => {
    const { engine, transport } = setup([a], [pedal('sustain', 0, 2)]);
    transport.play();
    at(engine, 1.95);
    expect(engine.calls.some((call) => call.op === 'release')).toBe(false);
    at(engine, 1.96);
    expect(calls(engine).at(-1)).toEqual({
      op: 'release',
      channel: 'playback',
      pitch: 60,
      time: 2.05,
    });
  });

  it('plays notes under the soft pedal more quietly', () => {
    const { engine, transport } = setup([a], [pedal('soft', 0, 1)]);
    transport.play();
    expect(engine.calls[0]).toMatchObject({ op: 'attack', velocity: 70 });
  });

  it('releases overlapping notes of one pitch under sustain once', () => {
    const { engine, transport } = setup(
      [note('x', 60, 0, 0.3), note('y', 60, 0.2, 0.5)],
      [pedal('sustain', 0, 3)],
    );
    transport.play();
    expect(calls(engine)).toEqual([
      { op: 'attack', channel: 'playback', pitch: 60, velocity: 100, time: 0.05 },
    ]);
    at(engine, 0.2);
    expect(calls(engine)[1]).toEqual({
      op: 'attack',
      channel: 'playback',
      pitch: 60,
      velocity: 100,
      time: 0.25,
    });
    at(engine, 0.5);
    at(engine, 2.9);
    expect(engine.calls.some((call) => call.op === 'release')).toBe(false);
    at(engine, 2.96);
    const releases = calls(engine).filter((call) => call.op === 'release');
    expect(releases).toEqual([{ op: 'release', channel: 'playback', pitch: 60, time: 3.05 }]);
  });

  it('releases the old pitch when a sounding note changes pitch', () => {
    const { engine, transport } = setup([note('n', 60, 0, 1)]);
    transport.play();
    at(engine, 0.3);
    const before = engine.calls.length;
    transport.setProject(project([note('n', 62, 0, 1)]));
    expect(calls(engine).slice(before)).toEqual([
      { op: 'release', channel: 'playback', pitch: 60, time: 0.4 },
    ]);
    for (const time of [0.6, 0.9, 1.2, 1.5]) at(engine, time);
    expect(engine.calls.some((call) => call.op === 'release' && call.pitch === 62)).toBe(false);
  });

  it('releases a sounding note removed during playback', () => {
    const { engine, transport } = setup([note('n', 60, 0, 1)]);
    transport.play();
    at(engine, 0.3);
    transport.setProject(project([]));
    expect(calls(engine).at(-1)).toEqual({
      op: 'release',
      channel: 'playback',
      pitch: 60,
      time: 0.4,
    });
  });

  it('pauses at the end of the timeline and plays again from the start', () => {
    const { engine, transport } = setup([]);
    transport.play();
    at(engine, 60.06);
    expect(transport.getSnapshot()).toEqual({ status: 'paused', position: 60, rate: 1 });
    expect(engine.calls.at(-1)).toMatchObject({ op: 'releaseAll', channel: 'playback' });
    expect(engine.activeTickers).toBe(0);

    transport.play();
    engine.time = 60.2;
    expect(transport.getPosition()).toBeCloseTo(0.09);
  });

  it('notifies listeners when the status or the cue position changes', () => {
    const { engine, transport } = setup([]);
    const listener = vi.fn();
    const unsubscribe = transport.subscribe(listener);

    transport.play();
    expect(listener).toHaveBeenCalledTimes(1);
    const snapshot = transport.getSnapshot();
    at(engine, 0.5);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(transport.getSnapshot()).toBe(snapshot);
    transport.pause();
    expect(listener).toHaveBeenCalledTimes(2);
    transport.seek(5);
    expect(listener).toHaveBeenCalledTimes(3);
    transport.stop();
    expect(listener).toHaveBeenCalledTimes(4);
    transport.play();
    at(engine, 61);
    expect(transport.getSnapshot().status).toBe('paused');
    expect(listener).toHaveBeenCalledTimes(6);

    unsubscribe();
    transport.stop();
    expect(listener).toHaveBeenCalledTimes(6);
  });

  it('never touches the live channel', () => {
    const { engine, transport } = setup([a, note('b', 64, 0.2, 0.8)], [pedal('sustain', 0, 1)]);
    transport.play();
    for (const time of [0.3, 0.8, 1.2]) at(engine, time);
    transport.seek(0);
    transport.pause();
    transport.stop();
    expect(engine.calls.length).toBeGreaterThan(0);
    expect(engine.calls.every((call) => call.channel === 'playback')).toBe(true);
  });

  it('starts at the default rate', () => {
    expect(new Transport().getSnapshot().rate).toBe(1);
  });

  it('changes the rate while stopped and clamps it', () => {
    const { transport } = setup();
    const listener = vi.fn();
    transport.subscribe(listener);
    transport.setRate(0.5);
    expect(transport.getSnapshot()).toEqual({ status: 'stopped', position: 0, rate: 0.5 });
    expect(listener).toHaveBeenCalledTimes(1);
    transport.setRate(0.5);
    expect(listener).toHaveBeenCalledTimes(1);
    transport.setRate(3);
    expect(transport.getSnapshot().rate).toBe(2);
    transport.setRate(NaN);
    expect(transport.getSnapshot().rate).toBe(1);
  });

  it('schedules notes at the playback rate', () => {
    const { engine, transport } = setup();
    transport.setRate(0.5);
    transport.play();
    expect(calls(engine)).toEqual([
      { op: 'attack', channel: 'playback', pitch: 60, velocity: 100, time: 0.05 },
    ]);
    at(engine, 0.5);
    expect(engine.calls).toHaveLength(1);
    at(engine, 1.0);
    expect(calls(engine)[1]).toEqual({ op: 'release', channel: 'playback', pitch: 60, time: 1.05 });
    engine.time = 1.05;
    expect(transport.getPosition()).toBeCloseTo(0.5);
  });

  it('restarts playback from the current position when the rate changes', () => {
    const { engine, transport } = setup();
    transport.setRate(0.5);
    transport.play();
    at(engine, 1.0);
    engine.time = 1.05;
    const listener = vi.fn();
    transport.subscribe(listener);
    const before = engine.calls.length;
    transport.setRate(2);
    expect(calls(engine).slice(before)).toEqual([
      { op: 'releaseAll', channel: 'playback', time: 1.05 },
    ]);
    expect(transport.getSnapshot().status).toBe('playing');
    expect(transport.getSnapshot().rate).toBe(2);
    expect(listener).toHaveBeenCalledTimes(1);
    engine.time = 1.35;
    expect(transport.getPosition()).toBeCloseTo(1.0);
  });

  it('keeps the rate on pause, seek and stop', () => {
    const { engine, transport } = setup();
    transport.setRate(0.5);
    transport.play();
    engine.time = 1;
    transport.pause();
    expect(transport.getSnapshot().rate).toBe(0.5);
    transport.seek(3);
    expect(transport.getSnapshot()).toEqual({ status: 'paused', position: 3, rate: 0.5 });
    transport.stop();
    expect(transport.getSnapshot()).toEqual({ status: 'stopped', position: 0, rate: 0.5 });
  });

  it('extends the timeline to the end of the media', () => {
    const { engine, transport } = setup([]);
    transport.setMediaDuration(90);
    transport.play();
    at(engine, 94.06);
    expect(transport.getSnapshot().status).toBe('paused');
    expect(transport.getSnapshot().position).toBe(94);
  });

  it('pauses at the end of the notes without media', () => {
    const { engine, transport } = setup([]);
    transport.setMediaDuration(-5);
    transport.play();
    at(engine, 60.06);
    expect(transport.getSnapshot()).toEqual({ status: 'paused', position: 60, rate: 1 });
  });

  it('pauses at the new end when the media is removed during playback', () => {
    const { engine, transport } = setup([]);
    transport.setMediaDuration(90);
    transport.play();
    engine.time = 70.05;
    transport.setMediaDuration(0);
    engine.tick();
    expect(transport.getSnapshot()).toEqual({ status: 'paused', position: 60, rate: 1 });
  });

  it('reports the remaining start delay in timeline seconds', () => {
    const { engine, transport } = setup();
    expect(transport.getStartDelay()).toBe(0);
    transport.play();
    expect(transport.getStartDelay()).toBeCloseTo(0.05);
    engine.time = 0.02;
    expect(transport.getStartDelay()).toBeCloseTo(0.03);
    engine.time = 0.1;
    expect(transport.getStartDelay()).toBe(0);
    transport.setRate(2);
    expect(transport.getStartDelay()).toBeCloseTo(0.1);
    transport.pause();
    expect(transport.getStartDelay()).toBe(0);
  });

  it('stops and drops the engine on dispose', () => {
    const { engine, transport } = setup();
    transport.play();
    engine.time = 0.3;
    transport.dispose();
    expect(engine.calls.at(-1)).toMatchObject({ op: 'releaseAll', channel: 'playback' });
    expect(engine.activeTickers).toBe(0);
    expect(transport.hasEngine()).toBe(false);
  });
});
