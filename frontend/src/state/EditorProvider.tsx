import { useReducer, type ReactNode } from 'react';
import { EditorDispatchContext, EditorStateContext } from './editorContext.ts';
import { editorReducer } from './editorReducer.ts';
import { DEFAULT_EDITOR_STATE, type EditorState } from './editorState.ts';

interface EditorProviderProps {
  children: ReactNode;
  initialState?: Partial<EditorState>;
}

export default function EditorProvider({ children, initialState }: EditorProviderProps) {
  const [state, dispatch] = useReducer(editorReducer, initialState, (initial) => ({
    ...DEFAULT_EDITOR_STATE,
    ...initial,
  }));
  return (
    <EditorStateContext.Provider value={state}>
      <EditorDispatchContext.Provider value={dispatch}>{children}</EditorDispatchContext.Provider>
    </EditorStateContext.Provider>
  );
}
