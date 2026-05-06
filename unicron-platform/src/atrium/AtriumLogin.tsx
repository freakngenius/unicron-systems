// Atrium login screen — magic link + Google OAuth, with email allowlist enforcement.
//
// Flow:
//  1. User lands on atrium.unicron.systems
//  2. Chooses "magic link" or "Continue with Google"
//  3. After auth callback, email is checked against VITE_ATRIUM_EMAIL_ALLOWLIST
//  4. If denied → sign out + show access-denied message
//  5. If allowed → upsert nervous_system.team_members row → redirect to /

import { useState, useEffect, type FormEvent } from 'react';
import { getSupabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

const ALLOWLIST: string[] = (import.meta.env.VITE_ATRIUM_EMAIL_ALLOWLIST ?? '')
  .split(',')
  .map((e: string) => e.trim().toLowerCase())
  .filter(Boolean);

async function upsertTeamMember(email: string, name: string | undefined) {
  const supabase = getSupabase();
  // Check for existing row
  const { data: existing } = await supabase
    .schema('nervous_system')
    .from('team_members')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (!existing) {
    await supabase.schema('nervous_system').from('team_members').insert({
      email,
      name: name ?? email.split('@')[0],
      role: null,
      active: true,
    });
  }
}

export function AtriumLogin() {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [checkingAllowlist, setCheckingAllowlist] = useState(false);

  // After auth, check allowlist and upsert team member
  useEffect(() => {
    if (auth.status !== 'signed-in') return;

    const userEmail = auth.user.email ?? '';
    const allowed = ALLOWLIST.length === 0 || ALLOWLIST.includes(userEmail.toLowerCase());

    if (!allowed) {
      setDenied(true);
      getSupabase().auth.signOut();
      return;
    }

    setCheckingAllowlist(true);
    const displayName =
      (auth.user.user_metadata as Record<string, string> | undefined)?.full_name ??
      (auth.user.user_metadata as Record<string, string> | undefined)?.name;

    upsertTeamMember(userEmail, displayName).finally(() => {
      setCheckingAllowlist(false);
      // AtriumApp handles the signed-in → home redirect; nothing to do here
    });
  }, [auth.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onMagicLink(e: FormEvent) {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    setError(null);
    const supabase = getSupabase();
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setSubmitting(false);
    if (err) {
      setError(err.message);
    } else {
      setSentTo(email.trim());
    }
  }

  async function onGoogleSignIn() {
    const supabase = getSupabase();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  }

  if (auth.status === 'loading' || checkingAllowlist) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="mono text-[11px] uppercase tracking-[0.22em] text-text-secondary animate-pulse">
          {checkingAllowlist ? 'verifying access…' : 'loading…'}
        </div>
      </div>
    );
  }

  if (denied) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center px-6">
        <div className="bg-bg-card border border-accent-magenta/40 rounded-lg p-10 max-w-[420px] w-full">
          <div className="mono text-[11px] uppercase tracking-[0.22em] text-accent-magenta mb-3">
            Access Denied
          </div>
          <p className="mono text-[12px] text-text-secondary leading-relaxed">
            Your email is not on the Atrium access list. Contact Kyle if you should have access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center px-6">
      <div className="bg-bg-card border border-border-default rounded-lg p-10 max-w-[420px] w-full">
        <div className="mono text-[11px] uppercase tracking-[0.22em] text-accent-gold mb-1">
          Atrium
        </div>
        <div className="mono text-[10px] uppercase tracking-[0.18em] text-text-secondary mb-6">
          Unicron Internal Cockpit
        </div>

        {sentTo ? (
          <p className="mono text-[12px] text-text-primary leading-relaxed">
            Magic link sent to{' '}
            <span className="text-accent-gold">{sentTo}</span>. Open the email and click through to
            continue.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Google OAuth */}
            <button
              onClick={onGoogleSignIn}
              className="w-full flex items-center justify-center gap-2 bg-white text-bg-base mono text-[12px] tracking-[0.10em] uppercase py-3 px-5 rounded-md hover:bg-text-primary transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-border-default" />
              <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-secondary">or</span>
              <div className="flex-1 border-t border-border-default" />
            </div>

            {/* Magic link */}
            <form onSubmit={onMagicLink} className="space-y-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@unicron.systems"
                className="w-full bg-bg-input border border-border-default rounded-md px-3 py-2 mono text-[13px] text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-border-hover"
              />
              {error && (
                <div className="mono text-[11px] text-accent-magenta border border-accent-magenta/40 rounded-md p-2">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={submitting || !email}
                className="w-full border border-border-hover text-text-primary mono text-[12px] tracking-[0.12em] uppercase py-3 px-5 rounded-md hover:border-border-hover hover:bg-bg-panel transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? 'sending…' : 'Continue with email →'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
