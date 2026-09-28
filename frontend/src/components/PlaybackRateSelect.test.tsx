import { fireEvent, render, screen } from '@testing-library/react';
import PlaybackRateSelect from './PlaybackRateSelect.tsx';

describe('PlaybackRateSelect', () => {
  it('lists the speeds and shows the current one', () => {
    render(<PlaybackRateSelect label="Audio speed" value={1} onChange={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: 'Audio speed' });
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(8);
    expect(options[0]).toHaveTextContent('0.25×');
    expect(select).toHaveValue('1');
    expect(screen.getByRole('option', { name: '1×' })).toHaveProperty('selected', true);
  });

  it('reports the chosen speed as a number', () => {
    const onChange = vi.fn();
    render(<PlaybackRateSelect label="Audio speed" value={1} onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Audio speed' }), {
      target: { value: '0.5' },
    });
    expect(onChange).toHaveBeenCalledWith(0.5);
  });

  it('can be disabled', () => {
    render(<PlaybackRateSelect label="Audio speed" value={1} onChange={vi.fn()} disabled />);
    expect(screen.getByRole('combobox', { name: 'Audio speed' })).toBeDisabled();
  });
});
