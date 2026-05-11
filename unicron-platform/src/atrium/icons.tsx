// Atrium canonical icon library — TSX port of
// Brand/Atrium Design System/components.jsx `I` (lucide-style, single stroke).
// Use these instead of inlining <svg> blocks so the production surface
// stays in lock-step with the design reference.

import type { SVGProps } from 'react';

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number;
  strokeWidth?: number;
}

function Icon({ size = 16, strokeWidth = 1.6, children, style, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
      {...rest}
    >
      {children}
    </svg>
  );
}

export const AtriumIcon = {
  Now:        (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Icon>,
  People:     (p: IconProps) => <Icon {...p}><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 20v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></Icon>,
  Work:       (p: IconProps) => <Icon {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M9 4v6"/></Icon>,
  Money:      (p: IconProps) => <Icon {...p}><path d="M12 2v20"/><path d="M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></Icon>,
  Marketing:  (p: IconProps) => <Icon {...p}><path d="M3 11l18-7v16l-18-7v-2z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></Icon>,
  Products:   (p: IconProps) => <Icon {...p}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12.01l8.73-5.05"/><path d="M12 22.08V12"/></Icon>,
  System:     (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.36.16.67.4.91.71.13.18.21.39.21.62v.34c0 .23-.08.44-.21.62-.24.31-.55.55-.91.71z"/></Icon>,
  Library:    (p: IconProps) => <Icon {...p}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></Icon>,
  Search:     (p: IconProps) => <Icon {...p}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></Icon>,
  Mic:        (p: IconProps) => <Icon {...p}><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2"/><path d="M12 19v3"/></Icon>,
  Plus:       (p: IconProps) => <Icon {...p}><path d="M12 5v14M5 12h14"/></Icon>,
  X:          (p: IconProps) => <Icon {...p}><path d="M18 6 6 18M6 6l12 12"/></Icon>,
  Check:      (p: IconProps) => <Icon {...p}><path d="M20 6 9 17l-5-5"/></Icon>,
  ChevronR:   (p: IconProps) => <Icon {...p}><path d="m9 18 6-6-6-6"/></Icon>,
  ChevronD:   (p: IconProps) => <Icon {...p}><path d="m6 9 6 6 6-6"/></Icon>,
  ChevronL:   (p: IconProps) => <Icon {...p}><path d="m15 18-6-6 6-6"/></Icon>,
  ArrowUp:    (p: IconProps) => <Icon {...p}><path d="M12 19V5M5 12l7-7 7 7"/></Icon>,
  ArrowDown:  (p: IconProps) => <Icon {...p}><path d="M12 5v14M19 12l-7 7-7-7"/></Icon>,
  ArrowR:     (p: IconProps) => <Icon {...p}><path d="M5 12h14M12 5l7 7-7 7"/></Icon>,
  Filter:     (p: IconProps) => <Icon {...p}><path d="M22 3H2l8 9.46V19l4 2v-8.54z"/></Icon>,
  More:       (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></Icon>,
  Calendar:   (p: IconProps) => <Icon {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></Icon>,
  Bolt:       (p: IconProps) => <Icon {...p}><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></Icon>,
  Brain:      (p: IconProps) => <Icon {...p}><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08A2.5 2.5 0 0 1 2 14.5a2.5 2.5 0 0 1 1.32-2.2 2.5 2.5 0 0 1 0-4.6A2.5 2.5 0 0 1 2 5.5a2.5 2.5 0 0 1 4.06-1.94 2.5 2.5 0 0 1 3.44-1.56z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08A2.5 2.5 0 0 0 22 14.5a2.5 2.5 0 0 0-1.32-2.2 2.5 2.5 0 0 0 0-4.6A2.5 2.5 0 0 0 22 5.5a2.5 2.5 0 0 0-4.06-1.94 2.5 2.5 0 0 0-3.44-1.56z"/></Icon>,
  Book:       (p: IconProps) => <Icon {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></Icon>,
  Compass:    (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></Icon>,
  Megaphone:  (p: IconProps) => <Icon {...p}><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></Icon>,
  Wrench:     (p: IconProps) => <Icon {...p}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-3 3-2.7-.7L11.7 9z"/></Icon>,
  Database:   (p: IconProps) => <Icon {...p}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></Icon>,
  Mail:       (p: IconProps) => <Icon {...p}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></Icon>,
  Phone:      (p: IconProps) => <Icon {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></Icon>,
  Slack:      (p: IconProps) => <Icon {...p}><rect x="13" y="2" width="3" height="8" rx="1.5"/><rect x="2" y="13" width="8" height="3" rx="1.5"/><rect x="14" y="14" width="8" height="3" rx="1.5"/><rect x="8" y="14" width="3" height="8" rx="1.5"/></Icon>,
  Github:     (p: IconProps) => <Icon {...p}><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></Icon>,
  Doc:        (p: IconProps) => <Icon {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></Icon>,
  Lock:       (p: IconProps) => <Icon {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></Icon>,
  Pulse:      (p: IconProps) => <Icon {...p}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></Icon>,
  Globe:      (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></Icon>,
  Sparkle:    (p: IconProps) => <Icon {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></Icon>,
  Layers:     (p: IconProps) => <Icon {...p}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></Icon>,
  Eye:        (p: IconProps) => <Icon {...p}><path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></Icon>,
  Shield:     (p: IconProps) => <Icon {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></Icon>,
  Flag:       (p: IconProps) => <Icon {...p}><path d="M4 22V4M4 4h14l-3 5 3 5H4"/></Icon>,
  Camera:     (p: IconProps) => <Icon {...p}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></Icon>,
  Cmd:        (p: IconProps) => <Icon {...p}><path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/></Icon>,
  Zap:        (p: IconProps) => <Icon {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></Icon>,
  Inbox:      (p: IconProps) => <Icon {...p}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></Icon>,
  Heart:      (p: IconProps) => <Icon {...p}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></Icon>,
  Tag:        (p: IconProps) => <Icon {...p}><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></Icon>,
};

export type AtriumIconName = keyof typeof AtriumIcon;
