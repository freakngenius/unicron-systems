'use client';

// lib/user-prefs.ts — local-only persistence for per-user lightweight prefs:
// the set of starred project ids and the set of hidden project ids. Lives
// in localStorage keyed by `pf_starred` / `pf_hidden`. Falls back to an
// in-memory store on SSR / when localStorage is unavailable.
//
// Exposes a tiny store + hook pair so components can subscribe to changes
// (e.g. when the user stars a project elsewhere, every list re-renders).

import { useEffect, useReducer } from 'react';

const STARRED_KEY = 'pf_starred_v1';
const HIDDEN_KEY = 'pf_hidden_v1';

type Listener = (next: Set<string>) => void;

class IdSetStore {
  private value: Set<string>;
  private readonly storageKey: string;
  private listeners = new Set<Listener>();

  constructor(storageKey: string) {
    this.storageKey = storageKey;
    this.value = readFromStorage(storageKey);
  }

  get(): Set<string> {
    return this.value;
  }

  has(id: string): boolean {
    return this.value.has(id);
  }

  toggle(id: string): void {
    const next = new Set(this.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.set(next);
  }

  add(id: string): void {
    if (this.value.has(id)) return;
    const next = new Set(this.value);
    next.add(id);
    this.set(next);
  }

  remove(id: string): void {
    if (!this.value.has(id)) return;
    const next = new Set(this.value);
    next.delete(id);
    this.set(next);
  }

  clear(): void {
    if (this.value.size === 0) return;
    this.set(new Set());
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(next: Set<string>): void {
    this.value = next;
    writeToStorage(this.storageKey, next);
    this.listeners.forEach((fn) => fn(next));
  }
}

function readFromStorage(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.filter((x): x is string => typeof x === 'string'));
  } catch {
    // ignore — corrupt storage falls back to empty
  }
  return new Set();
}

function writeToStorage(key: string, value: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(value)));
  } catch {
    // ignore — quota or private mode
  }
}

const starredStore = new IdSetStore(STARRED_KEY);
const hiddenStore = new IdSetStore(HIDDEN_KEY);

function useIdSet(store: IdSetStore): Set<string> {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => store.subscribe(() => force()), [store]);
  return store.get();
}

export function useStarred(): Set<string> {
  return useIdSet(starredStore);
}

export function useHidden(): Set<string> {
  return useIdSet(hiddenStore);
}

export function toggleStar(id: string): void {
  starredStore.toggle(id);
}

export function hideProject(id: string): void {
  hiddenStore.add(id);
}

export function unhideAll(): void {
  hiddenStore.clear();
}

export function unhideProject(id: string): void {
  hiddenStore.remove(id);
}
