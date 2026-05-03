import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom doesn't ship ResizeObserver; the MiniSparkline (M3) uses it to redraw on resize.
if (!('ResizeObserver' in window)) {
  class StubResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    value: StubResizeObserver,
  });
  (globalThis as unknown as { ResizeObserver: typeof StubResizeObserver }).ResizeObserver =
    StubResizeObserver;
}

// jsdom doesn't ship matchMedia; some Tailwind motion-reduce paths read it.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}
