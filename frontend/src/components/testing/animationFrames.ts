/** Test helper: replaces requestAnimationFrame with a manual queue flushed by flushFrame(). */
export function stubAnimationFrames() {
  let nextId = 1;
  const queue = new Map<number, FrameRequestCallback>();
  const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    const id = nextId;
    nextId += 1;
    queue.set(id, callback);
    return id;
  });
  const cancelAnimationFrame = vi.fn((id: number) => {
    queue.delete(id);
  });
  vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
  vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);
  return {
    requestAnimationFrame,
    cancelAnimationFrame,
    /** Runs the callbacks queued so far (callbacks queued by them wait for the next frame). */
    flushFrame() {
      const callbacks = [...queue.values()];
      queue.clear();
      for (const callback of callbacks) callback(performance.now());
    },
    get pending() {
      return queue.size;
    },
  };
}
