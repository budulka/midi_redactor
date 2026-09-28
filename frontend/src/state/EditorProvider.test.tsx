import { fireEvent, render, screen } from '@testing-library/react';
import { useEditor, useEditorDispatch } from './editorContext.ts';
import { setGridDivision } from './editorState.ts';
import EditorProvider from './EditorProvider.tsx';

function GridConsumer() {
  const { gridDivision, snapEnabled, pixelsPerSecond } = useEditor();
  const dispatch = useEditorDispatch();
  return (
    <div>
      <span data-testid="state">{`${gridDivision} ${String(snapEnabled)} ${pixelsPerSecond}`}</span>
      <button type="button" onClick={() => dispatch(setGridDivision('1/8'))}>
        set
      </button>
    </div>
  );
}

describe('EditorProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('provides the default state and dispatch', () => {
    render(
      <EditorProvider>
        <GridConsumer />
      </EditorProvider>,
    );
    expect(screen.getByTestId('state')).toHaveTextContent('1/16 true 100');
    fireEvent.click(screen.getByRole('button', { name: 'set' }));
    expect(screen.getByTestId('state')).toHaveTextContent('1/8 true 100');
  });

  it('accepts an initial state', () => {
    render(
      <EditorProvider initialState={{ snapEnabled: false }}>
        <GridConsumer />
      </EditorProvider>,
    );
    expect(screen.getByTestId('state')).toHaveTextContent('1/16 false 100');
  });

  it('throws when hooks are used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function StateOnly() {
      useEditor();
      return null;
    }
    function DispatchOnly() {
      useEditorDispatch();
      return null;
    }
    expect(() => render(<StateOnly />)).toThrow('useEditor must be used within EditorProvider');
    expect(() => render(<DispatchOnly />)).toThrow(
      'useEditorDispatch must be used within EditorProvider',
    );
  });
});
