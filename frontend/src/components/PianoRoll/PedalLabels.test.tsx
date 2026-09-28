import { render, screen } from '@testing-library/react';
import PedalLabels from './PedalLabels.tsx';

describe('PedalLabels', () => {
  it('names the rows in lane order with the MIDI controller in the tooltip', () => {
    render(<PedalLabels />);
    const labels = ['Sustain', 'Sostenuto', 'Soft'].map((name) => screen.getByText(name));
    expect(labels.map((label) => label.getAttribute('title'))).toEqual([
      'MIDI CC64',
      'MIDI CC66',
      'MIDI CC67',
    ]);
    const [first, second, third] = labels;
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(second.compareDocumentPosition(third) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
