/**
 * Races a promise against a timeout. Returns `fallback` if the promise does not
 * resolve within `ms` milliseconds.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms)),
  ]);
}
