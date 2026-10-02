import { MAX_PITCH } from '../state/constants.ts';
import { clampPitch } from '../state/normalize.ts';
import type { Note, PedalEvent, TimeSignature } from '../state/types.ts';
import { KEY_COUNT } from './pitch.ts';
import { gridStepSeconds, type GridDivision } from './quantize.ts';
import { TIME_EPSILON, barDurationSeconds, beatDurationSeconds } from './time.ts';

export const ROW_HEIGHT_PX = 14;
export const KEYBOARD_WIDTH_PX = 72;
export const RULER_HEIGHT_PX = 24;
/** Height of the media timeline row above the ruler. */
export const MEDIA_TIMELINE_HEIGHT_PX = 28;
export const DEFAULT_PIXELS_PER_SECOND = 100;
export const MIN_PIXELS_PER_SECOND = 20;
export const MAX_PIXELS_PER_SECOND = 1000;
export const ZOOM_FACTOR = 1.25;
export const RESIZE_HANDLE_PX = 6;
export const MIN_GRID_LINE_SPACING_PX = 4;
export const MIN_TIMELINE_SECONDS = 60;
export const MIN_BAR_LABEL_SPACING_PX = 40;
/** Height of the bar that shows how long a note keeps sounding after its key is released. */
/** Gap kept between the playhead and the edge of the view when the view follows it. */
export const FOLLOW_MARGIN_PX = 24;
export const NOTE_TAIL_HEIGHT_PX = 4;

export interface ViewGeometry {
  readonly pixelsPerSecond: number;
  readonly rowHeight: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type HitZone = 'body' | 'resize';

export interface NoteHit {
  readonly noteId: string;
  readonly zone: HitZone;
}

export interface GridLayers {
  readonly barPx: number;
  readonly beatPx: number | null;
  readonly stepPx: number | null;
}

/** Top edge of the row of a pitch; row 0 is C8 (pitch 108). */
export function pitchToY(pitch: number, g: ViewGeometry): number {
  return (MAX_PITCH - pitch) * g.rowHeight;
}

/** Pitch of the row containing y (rows are [top, top + rowHeight)); clamps outside the keyboard. */
export function yToPitch(y: number, g: ViewGeometry): number {
  return clampPitch(MAX_PITCH - Math.floor(y / g.rowHeight));
}

export function timeToX(time: number, g: ViewGeometry): number {
  return time * g.pixelsPerSecond;
}

/** Time at x; never negative. */
export function xToTime(x: number, g: ViewGeometry): number {
  return Math.max(0, x / g.pixelsPerSecond);
}

export function noteRect(note: Note, g: ViewGeometry): Rect {
  return {
    x: timeToX(note.start, g),
    y: pitchToY(note.pitch, g),
    width: note.duration * g.pixelsPerSecond,
    height: g.rowHeight,
  };
}

/**
 * The thin bar after a note up to the moment it stops sounding (see noteSoundingEnds), vertically
 * centred in the note row. Null when the note does not sound past its own end.
 */
export function noteTailRect(note: Note, soundingEnd: number, g: ViewGeometry): Rect | null {
  const keyUp = note.start + note.duration;
  if (soundingEnd <= keyUp + TIME_EPSILON) return null;
  return {
    x: timeToX(keyUp, g),
    y: pitchToY(note.pitch, g) + (g.rowHeight - NOTE_TAIL_HEIGHT_PX) / 2,
    width: (soundingEnd - keyUp) * g.pixelsPerSecond,
    height: NOTE_TAIL_HEIGHT_PX,
  };
}

/**
 * Finds the topmost note under a point. Later notes are rendered on top, so the array is
 * scanned from the end. The right part of a note (at most a third of its width) is the resize zone.
 */
export function hitTestNotes(
  notes: readonly Note[],
  point: Point,
  g: ViewGeometry,
  handlePx: number = RESIZE_HANDLE_PX,
): NoteHit | null {
  for (let index = notes.length - 1; index >= 0; index -= 1) {
    const note = notes[index];
    const rect = noteRect(note, g);
    const inside =
      point.x >= rect.x &&
      point.x < rect.x + rect.width &&
      point.y >= rect.y &&
      point.y < rect.y + rect.height;
    if (!inside) continue;
    const handle = Math.min(handlePx, rect.width / 3);
    const zone: HitZone = point.x >= rect.x + rect.width - handle ? 'resize' : 'body';
    return { noteId: note.id, zone };
  }
  return null;
}

/**
 * Timeline length: at least MIN_TIMELINE_SECONDS, two bars past the last note end, pedal end or
 * the end of the loaded media, whole bars.
 */
export function timelineDurationSeconds(
  notes: readonly Note[],
  bpm: number,
  ts: TimeSignature,
  pedals: readonly PedalEvent[] = [],
  mediaDuration: number = 0,
): number {
  const bar = barDurationSeconds(bpm, ts);
  const lastNoteOrMediaEnd = notes.reduce(
    (end, note) => Math.max(end, note.start + note.duration),
    mediaDuration,
  );
  const lastEnd = pedals.reduce((end, pedal) => Math.max(end, pedal.end), lastNoteOrMediaEnd);
  const duration = Math.max(MIN_TIMELINE_SECONDS, lastEnd + 2 * bar);
  return Math.ceil(duration / bar - TIME_EPSILON) * bar;
}

export function gridContentSize(
  durationSeconds: number,
  g: ViewGeometry,
): { width: number; height: number } {
  return { width: durationSeconds * g.pixelsPerSecond, height: KEY_COUNT * g.rowHeight };
}

/**
 * Pixel periods of the vertical grid lines. Beat and step layers are dropped when they are
 * too dense; the step layer is also dropped when the step is not shorter than a beat.
 * Step lines are anchored at 0 s like snapToGrid, so steps that do not divide a bar
 * (e.g. 1/4T in 3/4) drift relative to bar lines, matching where notes actually snap.
 */
export function gridLayers(
  bpm: number,
  ts: TimeSignature,
  division: GridDivision,
  pixelsPerSecond: number,
  minSpacingPx: number = MIN_GRID_LINE_SPACING_PX,
): GridLayers {
  const beatSeconds = beatDurationSeconds(bpm, ts);
  const stepSeconds = gridStepSeconds(division, bpm);
  const barPx = barDurationSeconds(bpm, ts) * pixelsPerSecond;
  const rawBeatPx = beatSeconds * pixelsPerSecond;
  const rawStepPx = stepSeconds * pixelsPerSecond;
  const beatPx = ts.numerator === 1 || rawBeatPx < minSpacingPx ? null : rawBeatPx;
  const stepPx =
    stepSeconds >= beatSeconds - TIME_EPSILON || rawStepPx < minSpacingPx ? null : rawStepPx;
  return { barPx, beatPx, stepPx };
}

function gradientLayer(color: string, periodPx: number): string {
  return `repeating-linear-gradient(to right, ${color} 0 1px, transparent 1px ${periodPx}px)`;
}

/** CSS background-image with bar lines on top, then beat lines, then step lines. */
export function gridBackgroundImage(layers: GridLayers): string {
  const parts = [gradientLayer('var(--grid-bar)', layers.barPx)];
  if (layers.beatPx !== null) parts.push(gradientLayer('var(--grid-beat)', layers.beatPx));
  if (layers.stepPx !== null) parts.push(gradientLayer('var(--grid-step)', layers.stepPx));
  return parts.join(', ');
}

/** Smallest power of two k such that labels every k bars are at least minPx apart. */
export function barLabelStep(barPx: number, minPx: number = MIN_BAR_LABEL_SPACING_PX): number {
  if (!(barPx > 0) || !Number.isFinite(barPx)) return 1;
  let step = 1;
  while (step * barPx < minPx) step *= 2;
  return step;
}

export function clampZoom(pixelsPerSecond: number): number {
  return Math.min(MAX_PIXELS_PER_SECOND, Math.max(MIN_PIXELS_PER_SECOND, pixelsPerSecond));
}

/** Note opacity for a velocity: 0.35 at 1, 1 at 127. */
export function velocityToOpacity(velocity: number): number {
  return 0.35 + (0.65 * (velocity - 1)) / 126;
}

/**
 * New scrollLeft that brings the playhead back into view, page by page, or null when it is visible.
 * The sticky keyboard covers the left keyboardWidth pixels of the scroll container, so the visible
 * part of the timeline is [scrollLeft, scrollLeft + clientWidth - keyboardWidth).
 */
export function followScrollLeft(
  playheadX: number,
  scrollLeft: number,
  clientWidth: number,
  keyboardWidth: number = KEYBOARD_WIDTH_PX,
): number | null {
  const visibleEnd = scrollLeft + clientWidth - keyboardWidth - FOLLOW_MARGIN_PX;
  if (playheadX >= scrollLeft && playheadX <= visibleEnd) return null;
  return Math.max(0, playheadX - FOLLOW_MARGIN_PX);
}
