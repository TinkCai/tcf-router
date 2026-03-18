/**
 * Flushes all pending promises in the microtask queue
 * Useful for testing async code that uses Promises
 */
export function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Alternative implementation using setTimeout
 */
export function waitForTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
