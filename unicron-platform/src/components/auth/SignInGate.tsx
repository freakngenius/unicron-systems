import { useState, type FormEvent, type ReactNode } from 'react';
import { useAuth, sendMagicLink } from '../../lib/auth';
import { getEnv } from '../../lib/env';

type Props = {
  children: ReactNode;
};

/**
 * Wraps the app shell. If `VITE_AUTH_REQUIRED=true`, the children are only
 * rendered after a Supabase auth session is established. Otherwise the gate
 * is a no-op pass-through (anonymous reads against the public-read pathfinder
 * tables continue to work).
 */
export function SignInGate({ children }: Props) {
  const env = getEnv();
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!env.authRequired) return <>{children}</>;

  if (auth.status === 'loading') {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="mono text-[11px] uppercase tracking-[0.22em] text-text-secondary">
          loading session…
        </div>
      </div>
    );
  }

  if (auth.status === 'signed-in') return <>{children}</>;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    setError(null);
    const { error: err } = await sendMagicLink(email.trim());
    setSubmitting(false);
    if (err) {
      setError(err);
    } else {
      setSentTo(email.trim());
    }
  }

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center px-6">
      <div className="bg-bg-card border border-border-default rounded-lg p-10 max-w-[420px] w-full">
        <div className="mono text-[11px] uppercase tracking-[0.22em] text-accent-gold mb-3">
          OPERATOR SIGN-IN
        </div>
        {sentTo ? (
          <p className="mono text-[12px] text-text-primary leading-relaxed">
            magic link sent to <span className="text-accent-gold">{sentTo}</span>. open the email
            and click through to continue.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <p className="mono text-[12px] text-text-secondary leading-relaxed">
              enter your operator email. we'll send a one-click sign-in link.
            </p>
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
              className="w-full bg-accent-primary text-white mono text-[12px] tracking-[0.12em] uppercase py-3 px-5 rounded-md hover:bg-accent-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'sending…' : 'send magic link →'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
