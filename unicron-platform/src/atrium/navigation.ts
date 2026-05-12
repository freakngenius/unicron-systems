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

const NAV_EVENT = 'atrium:navigate';
const SETTINGS_EVENT = 'atrium:open-settings';

export function navigateAtrium(detail: AtriumNavDetail): void {
  window.dispatchEvent(new CustomEvent<AtriumNavDetail>(NAV_EVENT, { detail }));
}

export function onAtriumNavigate(handler: (detail: AtriumNavDetail) => void): () => void {
  const listener = (e: Event) => {
    const ce = e as CustomEvent<AtriumNavDetail>;
    if (ce.detail) handler(ce.detail);
  };
  window.addEventListener(NAV_EVENT, listener);
  return () => window.removeEventListener(NAV_EVENT, listener);
}

// Companion event: open the Settings drawer (Connections section preferred
// once it ships; for now the section anchor is informational).
export function openAtriumSettings(section?: string): void {
  window.dispatchEvent(new CustomEvent<{ section?: string }>(SETTINGS_EVENT, { detail: { section } }));
}

export function onOpenAtriumSettings(handler: (section?: string) => void): () => void {
  const listener = (e: Event) => {
    const ce = e as CustomEvent<{ section?: string }>;
    handler(ce.detail?.section);
  };
  window.addEventListener(SETTINGS_EVENT, listener);
  return () => window.removeEventListener(SETTINGS_EVENT, listener);
}
