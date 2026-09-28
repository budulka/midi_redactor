/** True for the rejection of an interrupted media operation (a newer load or pause won). */
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { readonly name?: unknown }).name === 'AbortError'
  );
}

export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
