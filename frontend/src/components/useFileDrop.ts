import type { DragEvent } from 'react';

/** Drag-and-drop handlers that pass the first dropped file and keep the browser from opening it. */
export function useFileDrop(onFile: (file: File) => void): {
  onDragOver(event: DragEvent<HTMLElement>): void;
  onDrop(event: DragEvent<HTMLElement>): void;
} {
  return {
    onDragOver(event) {
      event.preventDefault();
      // DragEvent.dataTransfer can be null for synthetic events.
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    },
    onDrop(event) {
      event.preventDefault();
      const file = event.dataTransfer?.files[0];
      if (file !== undefined) onFile(file);
    },
  };
}
