import { fireEvent, render, screen } from '@testing-library/react';
import FileLoadButton from './FileLoadButton.tsx';

function setup() {
  const onFile = vi.fn();
  render(
    <FileLoadButton text="Load video…" inputLabel="Video file" accept=".webm" onFile={onFile} />,
  );
  const input = screen.getByLabelText<HTMLInputElement>('Video file');
  return { onFile, input };
}

describe('FileLoadButton', () => {
  it('renders the text and a file input with the accept list', () => {
    const { input } = setup();
    expect(screen.getByText('Load video…')).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('accept', '.webm');
  });

  it('passes the chosen file and resets the input', () => {
    const { onFile, input } = setup();
    const file = new File(['x'], 'clip.webm', { type: 'video/webm' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
    expect(input.value).toBe('');
  });

  it('ignores an empty file list', () => {
    const { onFile, input } = setup();
    fireEvent.change(input, { target: { files: [] } });
    expect(onFile).not.toHaveBeenCalled();
  });
});
