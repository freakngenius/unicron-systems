import { useEffect, useState } from 'react';

const KEY = 'atrium:filterSidebar:collapsed';

function read(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function write(collapsed: boolean) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, collapsed ? '1' : '0');
  } catch {
    // ignore
  }
}

export function useFilterSidebarCollapsed(): [boolean, (next: boolean) => void] {
  const [collapsed, setCollapsedState] = useState<boolean>(read);

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === KEY) setCollapsedState(e.newValue === '1');
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const setCollapsed = (next: boolean) => {
    setCollapsedState(next);
    write(next);
    window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: next ? '1' : '0' }));
  };

  return [collapsed, setCollapsed];
}
