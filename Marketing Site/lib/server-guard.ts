// Runtime guard: ensure this module is not loaded in the browser.
// Lighter than the `server-only` package which can't be imported from
// tsx scripts (it throws outside RSC contexts).
export function assertServer(modulePath: string) {
  if (typeof window !== "undefined") {
    throw new Error(`Module ${modulePath} may not be imported in the browser`);
  }
}
