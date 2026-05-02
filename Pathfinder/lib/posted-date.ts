// lib/posted-date.ts — shared helper for the Demo Polish UX Gate 3D
// "Posted" relative-date format. Top line: "X days ago" / "Today"; subtitle:
// MM-DD-YY in monospace.

export interface PostedDateLabel {
  /** Relative top line, e.g. "3 days ago" or "Today" or "—". */
  top: string;
  /** Subtitle in MM-DD-YY format; null when the input is null. */
  subtitle: string | null;
}

const MS_PER_DAY = 86_400_000;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatPostedDate(
  iso: string | null,
  now: Date = new Date(),
): PostedDateLabel {
  if (!iso) return { top: '—', subtitle: null };
  // Accept ISO date (YYYY-MM-DD) or full datetime.
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return { top: '—', subtitle: null };
  const dt = new Date(t);
  // Subtitle: MM-DD-YY (zero-padded, 2-digit year).
  const mm = pad2(dt.getUTCMonth() + 1);
  const dd = pad2(dt.getUTCDate());
  const yy = pad2(dt.getUTCFullYear() % 100);
  const subtitle = `${mm}-${dd}-${yy}`;

  // Top line: relative.
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const day = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
  const diffDays = Math.round((today - day) / MS_PER_DAY);

  let top: string;
  if (diffDays === 0) top = 'Today';
  else if (diffDays === 1) top = '1 day ago';
  else if (diffDays > 1) top = `${diffDays} days ago`;
  else if (diffDays === -1) top = 'in 1 day';
  else top = `in ${-diffDays} days`;

  return { top, subtitle };
}
