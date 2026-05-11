/* Atrium shared atoms — TypeScript port of /Atrium/Web UI/components.jsx (v3 canonical).
   All components consume CSS custom properties from atrium-tokens.css via var(--*). */

import type { CSSProperties, ReactNode, MouseEvent } from 'react';

// ---------- Icon ----------

interface IconProps {
  d?: string;
  size?: number;
  fill?: string;
  strokeWidth?: number;
  children?: ReactNode;
  style?: CSSProperties;
  className?: string;
}

export function Icon({ d, size = 16, fill = 'none', strokeWidth = 1.6, children, style, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
      className={className}
    >
      {d ? <path d={d} /> : children}
    </svg>
  );
}

// Named icon set — lucide-style, single stroke
export const I = {
  Now:       (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Icon>,
  People:    (p: IconProps) => <Icon {...p}><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 20v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></Icon>,
  Work:      (p: IconProps) => <Icon {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M9 4v6"/></Icon>,
  Money:     (p: IconProps) => <Icon {...p}><path d="M12 2v20"/><path d="M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></Icon>,
  Marketing: (p: IconProps) => <Icon {...p}><path d="M3 11l18-7v16l-18-7v-2z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></Icon>,
  Products:  (p: IconProps) => <Icon {...p}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12.01l8.73-5.05"/><path d="M12 22.08V12"/></Icon>,
  System:    (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 18 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></Icon>,
  Library:   (p: IconProps) => <Icon {...p}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></Icon>,
  Skills:    (p: IconProps) => <Icon {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></Icon>,
  Search:    (p: IconProps) => <Icon {...p}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></Icon>,
  Mic:       (p: IconProps) => <Icon {...p}><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2"/><path d="M12 19v3"/></Icon>,
  Plus:      (p: IconProps) => <Icon {...p}><path d="M12 5v14M5 12h14"/></Icon>,
  X:         (p: IconProps) => <Icon {...p}><path d="M18 6 6 18M6 6l12 12"/></Icon>,
  Check:     (p: IconProps) => <Icon {...p}><path d="M20 6 9 17l-5-5"/></Icon>,
  ChevronR:  (p: IconProps) => <Icon {...p}><path d="m9 18 6-6-6-6"/></Icon>,
  ChevronD:  (p: IconProps) => <Icon {...p}><path d="m6 9 6 6 6-6"/></Icon>,
  ChevronL:  (p: IconProps) => <Icon {...p}><path d="m15 18-6-6 6-6"/></Icon>,
  ArrowUp:   (p: IconProps) => <Icon {...p}><path d="M12 19V5M5 12l7-7 7 7"/></Icon>,
  ArrowDown: (p: IconProps) => <Icon {...p}><path d="M12 5v14M19 12l-7 7-7-7"/></Icon>,
  ArrowR:    (p: IconProps) => <Icon {...p}><path d="M5 12h14M12 5l7 7-7 7"/></Icon>,
  Filter:    (p: IconProps) => <Icon {...p}><path d="M22 3H2l8 9.46V19l4 2v-8.54z"/></Icon>,
  More:      (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></Icon>,
  Calendar:  (p: IconProps) => <Icon {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></Icon>,
  Bolt:      (p: IconProps) => <Icon {...p}><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></Icon>,
  Brain:     (p: IconProps) => <Icon {...p}><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08A2.5 2.5 0 0 1 2 14.5a2.5 2.5 0 0 1 1.32-2.2 2.5 2.5 0 0 1 0-4.6A2.5 2.5 0 0 1 2 5.5a2.5 2.5 0 0 1 4.06-1.94 2.5 2.5 0 0 1 3.44-1.56z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08A2.5 2.5 0 0 0 22 14.5a2.5 2.5 0 0 0-1.32-2.2 2.5 2.5 0 0 0 0-4.6A2.5 2.5 0 0 0 22 5.5a2.5 2.5 0 0 0-4.06-1.94 2.5 2.5 0 0 0-3.44-1.56z"/></Icon>,
  Book:      (p: IconProps) => <Icon {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></Icon>,
  Compass:   (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></Icon>,
  Megaphone: (p: IconProps) => <Icon {...p}><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></Icon>,
  Wrench:    (p: IconProps) => <Icon {...p}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-3 3-2.7-.7L11.7 9z"/></Icon>,
  Database:  (p: IconProps) => <Icon {...p}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></Icon>,
  Mail:      (p: IconProps) => <Icon {...p}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></Icon>,
  Phone:     (p: IconProps) => <Icon {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></Icon>,
  Slack:     (p: IconProps) => <Icon {...p}><rect x="13" y="2" width="3" height="8" rx="1.5"/><rect x="2" y="13" width="8" height="3" rx="1.5"/><rect x="14" y="14" width="8" height="3" rx="1.5"/><rect x="8" y="14" width="3" height="8" rx="1.5"/></Icon>,
  Github:    (p: IconProps) => <Icon {...p}><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></Icon>,
  Doc:       (p: IconProps) => <Icon {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></Icon>,
  Lock:      (p: IconProps) => <Icon {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></Icon>,
  Pulse:     (p: IconProps) => <Icon {...p}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></Icon>,
  Globe:     (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></Icon>,
  Sparkle:   (p: IconProps) => <Icon {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></Icon>,
  Layers:    (p: IconProps) => <Icon {...p}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></Icon>,
  Eye:       (p: IconProps) => <Icon {...p}><path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></Icon>,
  Shield:    (p: IconProps) => <Icon {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></Icon>,
  Flag:      (p: IconProps) => <Icon {...p}><path d="M4 22V4M4 4h14l-3 5 3 5H4"/></Icon>,
  Camera:    (p: IconProps) => <Icon {...p}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></Icon>,
  Cmd:       (p: IconProps) => <Icon {...p}><path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/></Icon>,
  Zap:       (p: IconProps) => <Icon {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></Icon>,
  Inbox:     (p: IconProps) => <Icon {...p}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></Icon>,
  Heart:     (p: IconProps) => <Icon {...p}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></Icon>,
  Tag:       (p: IconProps) => <Icon {...p}><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></Icon>,
};

// ---------- Avatar ----------

interface AvatarProps {
  name: string;
  color?: string;
  size?: number;
  src?: string;
}

export function Avatar({ name, color, size = 24, src }: AvatarProps) {
  const initials = name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: src ? `url(${src}) center/cover` : (color || 'linear-gradient(135deg,#3a4253,#1f242e)'),
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 600, color: '#0B1530',
      flexShrink: 0,
      boxShadow: '0 0 0 1px rgba(255,255,255,0.07) inset',
    }}>
      {!src && initials}
    </div>
  );
}

// ---------- Pill ----------

type PillTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'err' | 'info';
type PillSize = 'xs' | 'sm';

interface PillProps {
  children: ReactNode;
  tone?: PillTone;
  size?: PillSize;
}

const PILL_TONES: Record<PillTone, { bg: string; fg: string; bd: string }> = {
  neutral: { bg: 'var(--bg-raised)',   fg: 'var(--text-md)', bd: 'var(--border-subtle)' },
  accent:  { bg: 'var(--accent-soft)', fg: 'var(--accent)',  bd: 'rgba(232,118,58,0.25)' },
  ok:      { bg: 'var(--ok-soft)',     fg: 'var(--ok)',      bd: 'rgba(79,178,134,0.25)' },
  warn:    { bg: 'var(--warn-soft)',   fg: 'var(--warn)',    bd: 'rgba(217,162,58,0.25)' },
  err:     { bg: 'var(--err-soft)',    fg: 'var(--err)',     bd: 'rgba(221,98,98,0.25)' },
  info:    { bg: 'var(--info-soft)',   fg: 'var(--info)',    bd: 'rgba(111,149,214,0.25)' },
};

export function Pill({ children, tone = 'neutral', size = 'sm' }: PillProps) {
  const t = PILL_TONES[tone];
  const padY = size === 'xs' ? 1 : 2;
  const padX = size === 'xs' ? 6 : 8;
  const fs = size === 'xs' ? 'var(--text-2xs)' : 'var(--text-xs)';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: t.bg, color: t.fg, border: `1px solid ${t.bd}`,
      padding: `${padY}px ${padX}px`, borderRadius: 'var(--r-pill)',
      fontSize: fs, lineHeight: 1, fontWeight: 500, whiteSpace: 'nowrap',
      letterSpacing: 0.2,
    }}>{children}</span>
  );
}

// ---------- StatusDot ----------

type StatusTone = 'ok' | 'warn' | 'err' | 'info' | 'muted';

interface StatusDotProps {
  tone?: StatusTone;
  size?: number;
}

const DOT_COLORS: Record<StatusTone, string> = {
  ok:    'var(--ok)',
  warn:  'var(--warn)',
  err:   'var(--err)',
  info:  'var(--info)',
  muted: 'var(--text-faint)',
};

export function StatusDot({ tone = 'ok', size = 6 }: StatusDotProps) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%',
      background: DOT_COLORS[tone], display: 'inline-block', flexShrink: 0,
    }} />
  );
}

// ---------- StatusPulse ----------

interface StatusItem {
  label: string;
  tone: StatusTone;
  detail: string;
}

interface StatusPulseProps {
  items: StatusItem[];
}

export function StatusPulse({ items }: StatusPulseProps) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 10,
      padding: '6px 10px',
      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--r-pill)',
    }}>
      {items.map((it, i) => (
        <div key={i} title={`${it.label}: ${it.detail}`} style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'default',
        }}>
          <StatusDot tone={it.tone} size={6} />
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-md)', letterSpacing: 0.2 }}>
            {it.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------- Sparkline ----------

interface SparklineProps {
  data: number[];
  w?: number;
  h?: number;
  color?: string;
  fill?: boolean;
}

export function Sparkline({ data, w = 80, h = 24, color = 'var(--accent)', fill = false }: SparklineProps) {
  if (data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => [i * step, h - ((v - min) / range) * (h - 2) - 1] as [number, number]);
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const fillD = fill ? `${d} L ${w} ${h} L 0 ${h} Z` : null;
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      {fill && fillD && <path d={fillD} fill={color} opacity={0.15} />}
      <path d={d} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ---------- Metric ----------

interface MetricProps {
  label: string;
  value: string | number;
  delta?: string;
  deltaTone?: 'ok' | 'err' | 'neutral';
  spark?: number[];
  sparkColor?: string;
  unit?: string;
  sub?: string;
}

export function Metric({ label, value, delta, deltaTone, spark, sparkColor, unit, sub }: MetricProps) {
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--r-lg)', padding: '16px 18px',
      display: 'flex', flexDirection: 'column', gap: 8, minHeight: 96,
    }}>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-lo)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 600, lineHeight: 1, letterSpacing: -0.5 }}>
          {value}
        </span>
        {unit && <span style={{ color: 'var(--text-md)', fontSize: 'var(--text-md)' }}>{unit}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {delta !== undefined && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 2,
              color: deltaTone === 'ok' ? 'var(--ok)' : deltaTone === 'err' ? 'var(--err)' : 'var(--text-md)',
              fontSize: 'var(--text-xs)', fontWeight: 500,
            }}>
              {deltaTone === 'ok' ? '↑' : deltaTone === 'err' ? '↓' : '→'} {delta}
            </span>
          )}
          {sub && <span style={{ color: 'var(--text-lo)', fontSize: 'var(--text-xs)' }}>{sub}</span>}
        </div>
        {spark && <Sparkline data={spark} color={sparkColor || 'var(--accent)'} fill />}
      </div>
    </div>
  );
}

// ---------- Card ----------

interface CardProps {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  padding?: number;
  style?: CSSProperties;
}

export function Card({ title, subtitle, action, children, padding = 20, style }: CardProps) {
  return (
    <section style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--r-lg)', overflow: 'hidden', ...style,
    }}>
      {(title || action) && (
        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid var(--border-faint)',
        }}>
          <div>
            {title && <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-hi)' }}>{title}</div>}
            {subtitle && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-lo)', marginTop: 2 }}>{subtitle}</div>}
          </div>
          {action}
        </header>
      )}
      <div style={{ padding }}>{children}</div>
    </section>
  );
}

// ---------- DistBar ----------

interface DistBarProps {
  label: string;
  value?: string | number;
  percent: number;
  color?: string;
  maxLabel?: string;
}

export function DistBar({ label, percent, color = 'var(--accent)', maxLabel }: DistBarProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)' }}>
        <span style={{ color: 'var(--text-md)' }}>{label}</span>
        <span style={{ color: 'var(--text-hi)', fontFamily: 'var(--font-mono)' }}>
          {percent}%{maxLabel && <span style={{ color: 'var(--text-lo)' }}> · {maxLabel}</span>}
        </span>
      </div>
      <div style={{ height: 6, background: 'var(--bg-raised)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${percent}%`, height: '100%', background: color, borderRadius: 999 }} />
      </div>
    </div>
  );
}

// ---------- Btn ----------

type BtnVariant = 'primary' | 'ghost' | 'solid';
type BtnSize = 'sm' | 'md' | 'lg';

interface BtnProps {
  children?: ReactNode;
  variant?: BtnVariant;
  size?: BtnSize;
  icon?: ReactNode;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  style?: CSSProperties;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}

const BTN_VARIANTS: Record<BtnVariant, { bg: string; color: string; bd: string }> = {
  primary: { bg: 'var(--accent)',    color: 'var(--text-on-accent)', bd: 'var(--accent)' },
  ghost:   { bg: 'transparent',     color: 'var(--text-md)',         bd: 'var(--border-subtle)' },
  solid:   { bg: 'var(--bg-raised)', color: 'var(--text-hi)',        bd: 'var(--border-subtle)' },
};

const BTN_SIZES: Record<BtnSize, string> = {
  sm: '4px 10px',
  md: '6px 12px',
  lg: '9px 16px',
};

export function Btn({ children, variant = 'ghost', size = 'md', icon, onClick, style, disabled, type = 'button' }: BtnProps) {
  const v = BTN_VARIANTS[variant];
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: BTN_SIZES[size], borderRadius: 'var(--r-md)',
        background: v.bg, color: v.color, border: `1px solid ${v.bd}`,
        fontSize: 'var(--text-sm)', fontWeight: 500,
        transition: 'all var(--d-hover) var(--ease)',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
      onMouseEnter={e => { if (variant === 'ghost' && !disabled) e.currentTarget.style.background = 'var(--bg-raised)'; }}
      onMouseLeave={e => { if (variant === 'ghost') e.currentTarget.style.background = 'transparent'; }}
    >
      {icon}
      {children}
    </button>
  );
}

// ---------- BarChart ----------

interface BarChartProps {
  data: number[];
  h?: number;
  color?: string;
  labels?: string[];
}

export function BarChart({ data, h = 80, color = 'var(--accent)', labels }: BarChartProps) {
  const max = Math.max(...data) || 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: h }}>
        {data.map((v, i) => (
          <div key={i} style={{
            flex: 1, height: `${(v / max) * 100}%`, minHeight: 2,
            background: color, borderRadius: '3px 3px 0 0', opacity: 0.4 + (v / max) * 0.6,
          }} />
        ))}
      </div>
      {labels && (
        <div style={{ display: 'flex', gap: 4 }}>
          {labels.map((l, i) => (
            <span key={i} style={{ flex: 1, textAlign: 'center', fontSize: 'var(--text-2xs)', color: 'var(--text-lo)' }}>{l}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- LineChart ----------

interface LineSeries {
  data: number[];
  color: string;
  label?: string;
}

interface LineChartProps {
  series: LineSeries[];
  w?: number;
  h?: number;
  padding?: number;
}

export function LineChart({ series, w = 600, h = 180, padding = 24 }: LineChartProps) {
  if (!series.length || !series[0].data.length) return null;
  const allVals = series.flatMap(s => s.data);
  const max = Math.max(...allVals);
  const min = Math.min(0, ...allVals);
  const range = max - min || 1;
  const len = series[0].data.length;
  const step = (w - padding * 2) / Math.max(len - 1, 1);
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
        <line key={i}
          x1={padding} x2={w - padding}
          y1={padding + p * (h - padding * 2)} y2={padding + p * (h - padding * 2)}
          stroke="var(--border-faint)" strokeWidth="1"
        />
      ))}
      {series.map((s, si) => {
        const pts = s.data.map((v, i) => [
          padding + i * step,
          h - padding - ((v - min) / range) * (h - padding * 2),
        ] as [number, number]);
        const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
        const fillD = `${d} L ${pts[pts.length - 1][0]} ${h - padding} L ${pts[0][0]} ${h - padding} Z`;
        return (
          <g key={si}>
            <path d={fillD} fill={s.color} opacity={0.08} />
            <path d={d} stroke={s.color} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        );
      })}
    </svg>
  );
}
