import styles from './roadmap.module.css';

export default function Hero({ lastUpdated }: { lastUpdated: string }) {
  return (
    <section className={styles.hero}>
      <div className={`${styles.mono} ${styles.brand}`}>Pathfinder</div>
      <h1 className={styles.h1}>Roadmap</h1>
      <p className={styles.lede}>
        Pathfinder finds the next contract before the rep does. This page is the
        public log of what&rsquo;s live, what&rsquo;s building, and what&rsquo;s
        ahead &mdash; the agent fleet, the sources, and the operator surface area
        we&rsquo;ve shipped, are shipping, and have planned next.
      </p>
      <div className={`${styles.mono} ${styles.stamp}`}>
        Last updated{' '}
        <time dateTime={lastUpdated}>{formatDate(lastUpdated)}</time>
      </div>
    </section>
  );
}

function formatDate(iso: string): string {
  const [yStr, mStr, dStr] = iso.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
