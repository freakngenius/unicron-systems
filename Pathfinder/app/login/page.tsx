'use client';

import { useEffect, useState } from 'react';
import { sendMagicLink } from './actions';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Captured from the URL so we can propagate the operator's intended target
  // through the magic-link round-trip. Same-origin paths only; the server
  // re-validates via safeNext() before encoding it into the redirect.
  const [next, setNext] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const candidate = new URLSearchParams(window.location.search).get('next');
    if (candidate && candidate.startsWith('/') && !candidate.startsWith('//')) {
      setNext(candidate);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError('');
    const result = await sendMagicLink(email, next);
    if (result.error) {
      setError(result.error);
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
        fontFamily: 'var(--font-inter, sans-serif)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          padding: '2rem',
          background: '#111',
          border: '1px solid #222',
          borderRadius: 8,
        }}
      >
        <h1 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          Pathfinder
        </h1>
        <p style={{ color: '#888', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          Operator access only. Enter your operator email to receive a sign-in link.
        </p>

        {sent ? (
          <div style={{ color: '#4ade80', fontSize: '0.875rem' }}>
            Check your email — a sign-in link is on its way.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label style={{ display: 'block', color: '#aaa', fontSize: '0.75rem', marginBottom: '0.4rem' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@unicron.systems"
              required
              style={{
                width: '100%',
                padding: '0.6rem 0.75rem',
                background: '#0a0a0a',
                border: '1px solid #333',
                borderRadius: 4,
                color: '#fff',
                fontSize: '0.875rem',
                boxSizing: 'border-box',
                marginBottom: '1rem',
                outline: 'none',
              }}
            />
            {error && (
              <p style={{ color: '#f87171', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.6rem',
                background: loading ? '#333' : '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                fontSize: '0.875rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontWeight: 500,
              }}
            >
              {loading ? 'Sending…' : 'Send sign-in link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
