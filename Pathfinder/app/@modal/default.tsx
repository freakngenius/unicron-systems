// app/@modal/default.tsx — Demo Polish UX Gate 15A.
//
// Default export for the `@modal` parallel slot. Returns null so the
// slot is empty when no intercepting route is active (i.e. on every
// page that isn't a lead-detail intercept). Required by Next.js for
// hard navigations (refresh / direct URL load) so the slot has a
// fallback when no intercept matches.
export default function ModalDefault() {
  return null;
}
