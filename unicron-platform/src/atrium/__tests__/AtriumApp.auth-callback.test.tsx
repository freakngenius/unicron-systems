// Regression test for the magic-link login bounce.
//
// Background: Supabase implicit-flow magic links arrive at atrium.unicron.systems/
// with `#access_token=...&refresh_token=...` in the hash. supabase-js parses the
// hash asynchronously (`detectSessionInUrl: true`). Before the fix, the
// AtriumApp first-render normalization effect called `replaceRoute(route)` when
// pathname was `/` or `""`, which fires `history.replaceState` with a bare
// pathname and strips the auth fragment before supabase-js can consume it —
// the session never persists and the app falls back to AtriumLogin.

import { render, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../routes', async () => {
  const actual = await vi.importActual<typeof import('../routes')>('../routes');
  return {
    ...actual,
    replaceRoute: vi.fn(),
    pushRoute: vi.fn(),
  };
});

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({ status: 'loading' as const }),
}));

import { AtriumApp } from '../AtriumApp';
import { replaceRoute } from '../routes';

const setLocation = (pathname: string, hash = '', search = '') => {
  // jsdom doesn't allow direct assignment to window.location, but does allow
  // overriding individual fields when the descriptor is configurable.
  Object.defineProperty(window, 'location', {
    writable: true,
    value: {
      ...window.location,
      pathname,
      hash,
      search,
      href: `https://atrium.unicron.systems${pathname}${search}${hash}`,
    },
  });
};

describe('AtriumApp first-render normalization', () => {
  beforeEach(() => {
    vi.mocked(replaceRoute).mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('does NOT replaceRoute when window.location.hash contains access_token (magic-link arrival)', () => {
    setLocation('/', '#access_token=abc123&refresh_token=def456&token_type=bearer&type=magiclink', '');
    render(<AtriumApp />);
    expect(replaceRoute).not.toHaveBeenCalled();
  });

  it('does NOT replaceRoute when query contains a PKCE code', () => {
    setLocation('/', '', '?code=pkce-code-xyz');
    render(<AtriumApp />);
    expect(replaceRoute).not.toHaveBeenCalled();
  });

  it('does NOT replaceRoute when query contains an auth error', () => {
    setLocation('/', '', '?error=access_denied&error_description=expired');
    render(<AtriumApp />);
    expect(replaceRoute).not.toHaveBeenCalled();
  });

  it('still replaceRoutes for non-auth visits to `/`', () => {
    setLocation('/', '', '');
    render(<AtriumApp />);
    expect(replaceRoute).toHaveBeenCalledTimes(1);
  });
});
