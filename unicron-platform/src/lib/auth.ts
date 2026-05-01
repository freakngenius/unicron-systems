// Minimal magic-link Supabase auth wrapper.
//
// The operator UI is single-tenant — a small number of Unicron operators sign
// in with email and click a magic link. No password, no user table, no
// invitation flow yet. When `VITE_AUTH_REQUIRED` is "false" we bypass this
// entirely and run the app anonymously against the public-read pathfinder.*
// tables.

import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabase } from './supabase';

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; user: User; session: Session };

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    const supabase = getSupabase();
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) {
        setState({ status: 'signed-in', user: data.session.user, session: data.session });
      } else {
        setState({ status: 'signed-out' });
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (session) {
        setState({ status: 'signed-in', user: session.user, session });
      } else {
        setState({ status: 'signed-out' });
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

export async function sendMagicLink(email: string): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<void> {
  await getSupabase().auth.signOut();
}
