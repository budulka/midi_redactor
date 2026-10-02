import { useMemo } from 'react';
import { mediaTimeMapOf, type MediaTimeMap } from '../utils/mediaTimeMap.ts';
import { useProject } from './projectContext.ts';

/** The project's media time map; the same object until the offset or the cuts change. */
export function useMediaTimeMap(): MediaTimeMap {
  const { mediaOffset, mediaCuts } = useProject();
  return useMemo(() => mediaTimeMapOf({ mediaOffset, mediaCuts }), [mediaOffset, mediaCuts]);
}
