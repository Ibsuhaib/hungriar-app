// Module-level cache — survives React re-renders and navigation but clears on full page reload.
// Pattern: show cached data instantly, re-fetch silently in background.
const cache = {}

export const pageCache = {
  get: (key) => cache[key],
  set: (key, value) => { cache[key] = value },
  has: (key) => key in cache,
}
