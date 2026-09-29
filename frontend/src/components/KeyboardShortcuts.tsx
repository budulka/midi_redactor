import { useHistoryApi } from '../state/historyContext.ts';
import { useTransportApi } from '../state/transportContext.ts';
import { useGlobalShortcuts } from './useGlobalShortcuts.ts';

/** Page-wide keyboard shortcuts: undo, redo and play/pause. Renders nothing. */
export default function KeyboardShortcuts() {
  const history = useHistoryApi();
  const transportApi = useTransportApi();
  useGlobalShortcuts({
    undo: history.undo,
    redo: history.redo,
    playPause: transportApi.togglePlay,
  });
  return null;
}
