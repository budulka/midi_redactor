import { fireEvent, render, screen } from '@testing-library/react';
import CommitNumberInput from './CommitNumberInput.tsx';

function setup(value = 120) {
  const onCommit = vi.fn();
  const view = render(<CommitNumberInput value={value} onCommit={onCommit} label="Tempo" />);
  const input = screen.getByLabelText<HTMLInputElement>('Tempo');
  return { onCommit, input, view };
}

describe('CommitNumberInput', () => {
  it('shows the value', () => {
    const { input } = setup();
    expect(input.value).toBe('120');
  });

  it('commits on Enter once', () => {
    const { input, onCommit } = setup();
    fireEvent.change(input, { target: { value: '90' } });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(90);
  });

  it('commits on blur', () => {
    const { input, onCommit } = setup();
    fireEvent.change(input, { target: { value: '75' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(75);
  });

  it('restores the value for invalid text', () => {
    const { input, onCommit } = setup();
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('120');
  });

  it('restores the value on Escape', () => {
    const { input, onCommit } = setup();
    fireEvent.change(input, { target: { value: '50' } });
    expect(input.value).toBe('50');
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('120');
  });

  it('follows value changes from props', () => {
    const { input, onCommit, view } = setup();
    view.rerender(<CommitNumberInput value={95} onCommit={onCommit} label="Tempo" />);
    expect(input.value).toBe('95');
  });
});
