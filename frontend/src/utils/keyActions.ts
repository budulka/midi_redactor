/** Actions that move something one step back or forward; the big ones are the Shift variants. */
export type StepAction = 'stepBack' | 'stepForward' | 'bigStepBack' | 'bigStepForward';
/** Step actions plus jumps to the start and to the end. */
export type SeekAction = StepAction | 'toStart' | 'toEnd';
/** Actions of the focused media panel splitter. */
export type SplitterAction =
  'widen' | 'narrow' | 'widenMore' | 'narrowMore' | 'narrowest' | 'widest';

/** −1 for the back actions, 1 for the forward ones; big for the Shift variants. */
export function stepOf(action: StepAction): { readonly sign: -1 | 1; readonly big: boolean } {
  switch (action) {
    case 'stepBack':
      return { sign: -1, big: false };
    case 'stepForward':
      return { sign: 1, big: false };
    case 'bigStepBack':
      return { sign: -1, big: true };
    case 'bigStepForward':
      return { sign: 1, big: true };
  }
}
