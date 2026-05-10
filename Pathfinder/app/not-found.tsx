import Link from 'next/link';

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
        fontFamily: 'var(--font-inter, sans-serif)',
        flexDirection: 'column',
        gap: '1rem',
        textAlign: 'center',
        padding: '2rem',
      }}
    >
      <p style={{ color: '#555', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        404
      </p>
      <h1 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
        Page not found
      </h1>
      <p style={{ color: '#666', fontSize: '0.875rem', margin: 0 }}>
        That org or page does not exist in Pathfinder.
      </p>
      <Link
        href="/"
        style={{
          marginTop: '0.5rem',
          padding: '0.5rem 1.25rem',
          background: '#111',
          border: '1px solid #333',
          borderRadius: 4,
          color: '#aaa',
          fontSize: '0.875rem',
          textDecoration: 'none',
        }}
      >
        Back to dashboard
      </Link>
    </div>
  );
}
