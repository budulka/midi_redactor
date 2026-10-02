import { useMemo } from 'react';
import { mediaTimeMapOf, type MediaTimeMap } from '../utils/mediaTimeMap.ts';
import { useProject } from './projectContext.ts';

/** The project's media time map; the same object until the offset changes. */
export function useMediaTimeMap(): MediaTimeMap {
  const { mediaOffset } = useProject();
  return useMemo(() => mediaTimeMapOf({ mediaOffset }), [mediaOffset]);
}
