import { stepOf } from './keyActions.ts';

describe('stepOf', () => {
  it('gives the direction and size of a step', () => {
    expect(stepOf('stepBack')).toEqual({ sign: -1, big: false });
    expect(stepOf('stepForward')).toEqual({ sign: 1, big: false });
    expect(stepOf('bigStepBack')).toEqual({ sign: -1, big: true });
    expect(stepOf('bigStepForward')).toEqual({ sign: 1, big: true });
  });
});
