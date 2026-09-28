import { createId } from './id.ts';

describe('createId', () => {
  it('returns unique non-empty strings', () => {
    const first = createId();
    const second = createId();
    expect(first).not.toBe('');
    expect(first).not.toBe(second);
  });
});
