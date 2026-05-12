// Lightweight cross-tab navigation for Atrium without introducing a router.
// Callers dispatch `atrium:navigate` events; AtriumApp listens and switches
// the active top-level tab. Sub-tab/filter hints ride along in detail so the
// destination component can pick them up.

import type { AtriumTab } from './AtriumLayout';

export type AtriumNavDetail = {
  tab: AtriumTab;
  subTab?: string;
  filter?: Record<string, string | undefined>;
};

const EVENT = 'atrium:navigate';

export function navigateAtrium(detail: AtriumNavDetail): void {
  window.dispatchEvent(new CustomEvent<AtriumNavDetail>(EVENT, { detail }));
}

export function onAtriumNavigate(handler: (detail: AtriumNavDetail) => void): () => void {
  const listener = (e: Event) => {
    const ce = e as CustomEvent<AtriumNavDetail>;
    if (ce.detail) handler(ce.detail);
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
