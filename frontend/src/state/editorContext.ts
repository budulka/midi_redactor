import { createContext, useContext, type Dispatch } from 'react';
import type { EditorAction, EditorState } from './editorState.ts';

export const EditorStateContext = createContext<EditorState | null>(null);
export const EditorDispatchContext = createContext<Dispatch<EditorAction> | null>(null);

export function useEditor(): EditorState {
  const state = useContext(EditorStateContext);
  if (state === null) {
    throw new Error('useEditor must be used within EditorProvider');
  }
  return state;
}

export function useEditorDispatch(): Dispatch<EditorAction> {
  const dispatch = useContext(EditorDispatchContext);
  if (dispatch === null) {
    throw new Error('useEditorDispatch must be used within EditorProvider');
  }
  return dispatch;
}
