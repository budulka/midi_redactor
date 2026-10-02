import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { addMediaCut, addNote, setMediaOffset } from './actions.ts';
import { createEmptyProject } from './constants.ts';
import ProjectProvider from './ProjectProvider.tsx';
import { useProjectDispatch } from './projectContext.ts';
import { useMediaTimeMap } from './useMediaTimeMap.ts';

function wrapper({ children }: { children: ReactNode }) {
  return (
    <ProjectProvider initialProject={{ ...createEmptyProject(), mediaOffset: 1.5 }}>
      {children}
    </ProjectProvider>
  );
}

function useMapAndDispatch() {
  return { map: useMediaTimeMap(), dispatch: useProjectDispatch() };
}

describe('useMediaTimeMap', () => {
  it('maps with the project offset', () => {
    const { result } = renderHook(() => useMediaTimeMap(), { wrapper });
    expect(result.current).toEqual({ offset: 1.5, cuts: [] });
  });

  it('keeps the same object until the offset changes', () => {
    const { result } = renderHook(() => useMapAndDispatch(), { wrapper });
    const first = result.current.map;

    act(() => {
      result.current.dispatch(addNote({ pitch: 60, start: 0, duration: 1, velocity: 100 }));
    });
    expect(result.current.map).toBe(first);

    act(() => {
      result.current.dispatch(setMediaOffset(2));
    });
    expect(result.current.map).not.toBe(first);
    expect(result.current.map).toEqual({ offset: 2, cuts: [] });
  });

  it('gives a new map with the cuts when a cut is added', () => {
    const { result } = renderHook(() => useMapAndDispatch(), { wrapper });
    const first = result.current.map;

    act(() => {
      result.current.dispatch(addMediaCut({ start: 2, end: 5 }));
    });
    expect(result.current.map).not.toBe(first);
    expect(result.current.map.offset).toBe(1.5);
    expect(result.current.map.cuts).toEqual([{ id: expect.any(String), start: 2, end: 5 }]);
  });
});
