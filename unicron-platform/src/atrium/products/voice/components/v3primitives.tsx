/**
 * Atrium v3 primitives — Stellate-inspired light theme.
 *
 * All consumers must live inside an .atrium-v3 root so the CSS vars resolve.
 * Imported into Atrium under src/atrium/products/voice/components/. The
 * prototype's "use client" directive is stripped — Atrium has no RSC boundary.
 *
 * Translation note: V3VoiceTabs (defined below in this file) replaces the
 * prototype's URL-based variant from atrium-v3/AppShell.tsx. The prototype
 * used next/navigation usePathname() + next/link. Atrium drives sub-tabs
 * by component-local state passed in as props (active + onChange).
 */

import React, { ReactElement, ReactNode, useState } from "react";
import { I } from "./icons";

/* ============================================================
   V3VoiceTabs — Agents / Campaigns / Activity sub-nav for the
   Voice sub-tab inside Products. State-driven (no URL routing).
   ============================================================ */
export type VoiceSubSection = "agents" | "campaigns" | "activity";

export function V3VoiceTabs({
  active,
  onChange,
}: {
  active: VoiceSubSection;
  onChange: (next: VoiceSubSection) => void;
}) {
  const tabs: { id: VoiceSubSection; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
    { id: "agents",     label: "Agents",     icon: I.Phone },
    { id: "campaigns",  label: "Campaigns",  icon: I.Calendar },
    { id: "activity",   label: "Activity",   icon: I.Activity },
  ];
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        padding: "0 0 14px",
        borderBottom: "1px solid var(--v3-line)",
        marginBottom: 18,
      }}
    >
      {tabs.map((s) => {
        const isActive = active === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 14px",
              borderRadius: 8,
              color: isActive ? "var(--v3-ink)" : "var(--v3-ink-lo)",
              background: isActive ? "var(--v3-surface)" : "transparent",
              fontSize: 13,
              fontWeight: isActive ? 600 : 500,
              border: isActive ? "1px solid var(--v3-line)" : "1px solid transparent",
              boxShadow: isActive ? "0 1px 2px rgba(11,21,48,0.04)" : "none",
              transition: "all 140ms",
              cursor: "pointer",
            }}
          >
            <s.icon size={14} />
            <span>{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================
   VoicePhone — brand-orange phone glyph used everywhere voice appears
   ============================================================ */
export function VoicePhone({
  size = 14,
  color = "#E8763A",
  style
}: {
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

/* ============================================================
   V3StatusPill — pale Stellate-style status pills
   ============================================================ */
type Tone = "ok" | "warn" | "err" | "info" | "pass" | "neutral";

export function V3StatusPill({
  tone = "neutral",
  children
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  const map: Record<Tone, { bg: string; fg: string }> = {
    ok: { bg: "var(--v3-green-soft)", fg: "var(--v3-green)" },
    warn: { bg: "var(--v3-amber-soft)", fg: "var(--v3-amber)" },
    err: { bg: "var(--v3-red-soft)", fg: "var(--v3-red)" },
    info: { bg: "var(--v3-blue-soft)", fg: "var(--v3-blue)" },
    pass: { bg: "var(--v3-orange-soft)", fg: "var(--v3-orange)" },
    neutral: { bg: "var(--v3-bg-soft)", fg: "var(--v3-ink-md)" }
  };
  const t = map[tone] ?? map.neutral;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 9px",
        background: t.bg,
        color: t.fg,
        borderRadius: 5,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: 0.2
      }}
    >
      {children}
    </span>
  );
}

/* ============================================================
   V3Btn — primary (navy filled) / secondary (outline) / ghost
   ============================================================ */
type BtnKind = "primary" | "secondary" | "ghost" | "blue" | "orange";

export function V3Btn({
  kind = "primary",
  icon,
  children,
  onClick,
  disabled,
  type = "button",
  title,
  style
}: {
  kind?: BtnKind;
  icon?: ReactNode;
  children?: ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  title?: string;
  style?: React.CSSProperties;
}) {
  const map: Record<BtnKind, React.CSSProperties> = {
    primary: { background: "var(--v3-ink)", color: "#FFF" },
    blue: { background: "var(--v3-blue)", color: "#FFF" },
    orange: { background: "var(--v3-orange)", color: "#FFF" },
    secondary: {
      background: "var(--v3-surface)",
      color: "var(--v3-ink)",
      border: "1px solid var(--v3-line-strong)"
    },
    ghost: { background: "transparent", color: "var(--v3-ink-md)" }
  };
  const opacity = disabled ? 0.5 : 1;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "8px 13px",
        borderRadius: 7,
        fontSize: 13,
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
        opacity,
        ...map[kind],
        ...style
      }}
    >
      {icon}
      {children}
    </button>
  );
}

/* ============================================================
   V3GatedAction — wraps a trigger element. Shows
   "Validating…" pill for ~delay ms, then either Committed
   (green) or Bounced — reason (red).
   ============================================================ */
export function V3GatedAction({
  children,
  onCommit,
  taboo,
  label = "Validating",
  delay = 800
}: {
  children: ReactElement;
  onCommit?: () => void;
  taboo?: string | boolean | null;
  label?: string;
  delay?: number;
}) {
  const [state, setState] = useState<"idle" | "validating" | "bounced" | "done">("idle");

  const fire = (e?: React.MouseEvent) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (state === "validating") return;
    setState("validating");
    setTimeout(() => {
      if (taboo) {
        setState("bounced");
        setTimeout(() => setState("idle"), 2400);
        return;
      }
      setState("done");
      onCommit?.();
      setTimeout(() => setState("idle"), 900);
    }, delay);
  };

  const trigger = React.cloneElement(children as ReactElement<any>, { onClick: fire });

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
      {trigger}
      {state === "validating" && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11,
            color: "var(--v3-amber)",
            background: "rgba(232,158,58,0.10)",
            padding: "2px 7px",
            borderRadius: 4
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: "var(--v3-amber)",
              animation: "v3pulse 0.8s ease-in-out infinite"
            }}
          />
          {label}…
        </span>
      )}
      {state === "done" && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11,
            color: "var(--v3-green)",
            background: "rgba(31,138,91,0.10)",
            padding: "2px 7px",
            borderRadius: 4
          }}
        >
          ✓ Committed
        </span>
      )}
      {state === "bounced" && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11,
            color: "var(--v3-red)",
            background: "rgba(209,72,72,0.10)",
            padding: "2px 7px",
            borderRadius: 4
          }}
        >
          ✕ Bounced — {typeof taboo === "string" ? taboo : "taboo violation"}
        </span>
      )}
    </span>
  );
}

/* ============================================================
   V3Card / V3PanelCard — white surface with thin header
   ============================================================ */
export function V3PanelCard({
  title,
  subtitle,
  action,
  children,
  padding = 22,
  style
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  padding?: number;
  style?: React.CSSProperties;
}) {
  return (
    <section
      style={{
        background: "var(--v3-surface)",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow:
          "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)",
        ...style
      }}
    >
      {(title || action) && (
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 22px",
            borderBottom: "1px solid var(--v3-line-soft)"
          }}
        >
          <div>
            {title && (
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--v3-ink)"
                }}
              >
                {title}
              </div>
            )}
            {subtitle && (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--v3-ink-lo)",
                  marginTop: 2
                }}
              >
                {subtitle}
              </div>
            )}
          </div>
          {action}
        </header>
      )}
      <div style={{ padding }}>{children}</div>
    </section>
  );
}

/* ============================================================
   V3Tabs — icon + label with blue underline for active
   ============================================================ */
type TabSpec = { id: string; label: string; icon?: React.ComponentType<{ size?: number }> };

export function V3Tabs({
  tabs,
  active,
  setActive
}: {
  tabs: TabSpec[];
  active: string;
  setActive: (id: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        padding: "0 28px",
        borderBottom: "1px solid var(--v3-line)",
        background: "var(--v3-bg)"
      }}
    >
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "13px 14px",
              marginBottom: -1,
              fontSize: 14,
              fontWeight: 500,
              color: isActive ? "var(--v3-blue)" : "var(--v3-ink-md)",
              borderBottom: `2px solid ${isActive ? "var(--v3-blue)" : "transparent"}`,
              cursor: "pointer"
            }}
          >
            {t.icon ? <t.icon size={14} /> : null}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================
   V3PageBody / V3PageTitle — light rounded surface under topbar
   ============================================================ */
export function V3PageBody({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        background: "var(--v3-bg)",
        borderTopLeftRadius: 15,
        overflow: "hidden"
      }}
    >
      {children}
    </div>
  );
}

export function V3PageTitle({
  title,
  eyebrow,
  action
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        padding: "26px 28px 18px",
        background: "var(--v3-bg)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 16
      }}
    >
      <div>
        {eyebrow && (
          <div
            style={{
              fontSize: 12,
              color: "var(--v3-ink-lo)",
              marginBottom: 6
            }}
          >
            {eyebrow}
          </div>
        )}
        <h1
          className="v3-display"
          style={{
            fontSize: 36,
            fontWeight: 600,
            color: "var(--v3-ink)",
            margin: 0,
            lineHeight: 1,
            letterSpacing: -0.7
          }}
        >
          {title}
        </h1>
      </div>
      {action}
    </div>
  );
}

/* ============================================================
   V3FilterCheck / V3FilterGroup — left sidebar widgets
   ============================================================ */
export function V3FilterCheck({
  label,
  count,
  dot,
  defaultChecked
}: {
  label: string;
  count?: number;
  dot?: string;
  defaultChecked?: boolean;
}) {
  const [on, setOn] = useState(!!defaultChecked);
  return (
    <button
      onClick={() => setOn(!on)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "6px 4px",
        fontSize: 13,
        color: "var(--v3-ink)",
        cursor: "pointer"
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: 4,
          border: "1px solid " + (on ? "var(--v3-blue)" : "var(--v3-line-strong)"),
          background: on ? "var(--v3-blue)" : "var(--v3-surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          color: "#FFF",
          fontSize: 9
        }}
      >
        {on ? "✓" : ""}
      </span>
      {dot && (
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            background: dot,
            flexShrink: 0
          }}
        />
      )}
      <span
        style={{
          flex: 1,
          textAlign: "left",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis"
        }}
      >
        {label}
      </span>
      {count !== undefined && (
        <span
          className="v3-mono"
          style={{ fontSize: 11, color: "var(--v3-ink-lo)" }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export function V3FilterGroup({
  label,
  children,
  defaultOpen = false,
  badge
}: {
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
  badge?: number;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div
      style={{
        borderTop: "1px solid var(--v3-line-soft)",
        padding: "10px 0"
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          fontSize: 13.5,
          fontWeight: 600,
          color: "var(--v3-ink)",
          cursor: "pointer"
        }}
      >
        <span
          style={{
            color: "var(--v3-ink-lo)",
            display: "inline-flex",
            width: 12,
            justifyContent: "center"
          }}
        >
          {open ? "▾" : "▸"}
        </span>
        <span style={{ flex: 1, textAlign: "left" }}>{label}</span>
        {badge !== undefined && badge > 0 && (
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              color: "var(--v3-blue)",
              background: "rgba(96,129,190,0.12)",
              padding: "2px 6px",
              borderRadius: 999
            }}
          >
            {badge}
          </span>
        )}
      </button>
      {open && (
        <div
          style={{
            marginTop: 8,
            display: "flex",
            flexDirection: "column",
            gap: 2
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   V3FieldRow — uppercase label + child input
   ============================================================ */
export function V3FieldRow({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 10.5,
          color: "var(--v3-ink-lo)",
          textTransform: "uppercase",
          fontWeight: 600,
          letterSpacing: 0.4
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

export const V3InputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 11px",
  fontSize: 13,
  background: "var(--v3-surface)",
  border: "1px solid var(--v3-line-strong)",
  borderRadius: 6,
  fontFamily: "inherit",
  color: "var(--v3-ink)",
  outline: "none",
  boxSizing: "border-box"
};

/* ============================================================
   V3VoiceCollapse — collapsible white card wrapper for Voice surfaces
   ============================================================ */
export function V3VoiceCollapse({
  title,
  count,
  defaultOpen = false,
  children
}: {
  title: string;
  count?: number | null;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      style={{
        background: "var(--v3-surface)",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow:
          "0 1px 2px rgba(11,21,48,0.04), 0 4px 16px rgba(11,21,48,0.06)"
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          padding: "16px 22px",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "transparent",
          cursor: "pointer"
        }}
      >
        <span
          style={{
            color: "var(--v3-ink-lo)",
            transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            transition: "transform 200ms",
            display: "inline-block",
            width: 13
          }}
        >
          ▾
        </span>
        <h3
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: "var(--v3-ink)",
            margin: 0
          }}
        >
          {title}
        </h3>
        {count != null && (
          <span style={{ fontSize: 12, color: "var(--v3-ink-lo)" }}>· {count}</span>
        )}
      </button>
      {open && (
        <div style={{ borderTop: "1px solid var(--v3-line-soft)" }}>{children}</div>
      )}
    </div>
  );
}

/* ============================================================
   V3EmptyState — minimal centered empty
   ============================================================ */
export function V3EmptyState({
  title,
  description,
  action
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "60px 20px",
        color: "var(--v3-ink-md)"
      }}
    >
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "var(--v3-ink)",
          marginBottom: 6
        }}
      >
        {title}
      </div>
      {description && (
        <div
          style={{
            fontSize: 13,
            color: "var(--v3-ink-lo)",
            marginBottom: 16,
            maxWidth: 380,
            marginLeft: "auto",
            marginRight: "auto",
            lineHeight: 1.5
          }}
        >
          {description}
        </div>
      )}
      {action}
    </div>
  );
}

/* ============================================================
   Tiny toast that mirrors v1 toast API so pages can be ported easily
   ============================================================ */
type ToastTone = "ok" | "err" | "warn" | "info";
let toastHandler: ((msg: string, tone?: ToastTone) => void) | null = null;
export function v3toast(msg: string, tone: ToastTone = "info") {
  toastHandler?.(msg, tone);
}

export function V3ToastHost() {
  const [items, setItems] = useState<{ id: number; msg: string; tone: ToastTone }[]>([]);
  React.useEffect(() => {
    toastHandler = (msg, tone = "info") => {
      const id = Date.now() + Math.random();
      setItems((p) => [...p, { id, msg, tone }]);
      setTimeout(() => setItems((p) => p.filter((i) => i.id !== id)), 4200);
    };
    return () => {
      toastHandler = null;
    };
  }, []);
  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 100,
        pointerEvents: "none"
      }}
    >
      {items.map((i) => {
        const colorMap: Record<ToastTone, { bg: string; fg: string }> = {
          ok: { bg: "var(--v3-green-soft)", fg: "var(--v3-green)" },
          err: { bg: "var(--v3-red-soft)", fg: "var(--v3-red)" },
          warn: { bg: "var(--v3-amber-soft)", fg: "var(--v3-amber)" },
          info: { bg: "var(--v3-blue-soft)", fg: "var(--v3-blue)" }
        };
        const c = colorMap[i.tone];
        return (
          <div
            key={i.id}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              background: c.bg,
              color: c.fg,
              border: `1px solid ${c.fg}`,
              boxShadow: "0 4px 16px rgba(11,21,48,0.12)",
              pointerEvents: "auto",
              maxWidth: 360
            }}
          >
            {i.msg}
          </div>
        );
      })}
    </div>
  );
}
