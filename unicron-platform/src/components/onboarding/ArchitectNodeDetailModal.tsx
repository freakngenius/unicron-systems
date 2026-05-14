// Popup that opens when an Architect Canvas node is clicked. Surfaces the
// design detail for the selected node: source config, agent instructions,
// or dashboard summary.

import type { ArchitectNodeDetail } from './architectCanvasLayout';

type Props = {
  detail: ArchitectNodeDetail;
  onClose: () => void;
};

export function ArchitectNodeDetailModal({ detail, onClose }: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="arch-node-detail-title"
      data-testid="arch-node-detail-modal"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-overlay, rgba(11,21,48,0.55))',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--v3-surface)',
          color: 'var(--v3-ink)',
          border: '1px solid var(--v3-line)',
          borderRadius: 12,
          width: 'min(520px, 92vw)',
          maxHeight: '80vh',
          overflowY: 'auto',
          padding: '22px 24px',
          boxShadow: '0 20px 60px rgba(11,21,48,0.20)',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        <Header detail={detail} onClose={onClose} />
        <Body detail={detail} />
      </div>
    </div>
  );
}

function Header({ detail, onClose }: { detail: ArchitectNodeDetail; onClose: () => void }) {
  const title = titleFor(detail);
  const eyebrow = eyebrowFor(detail);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
      <div>
        <div
          style={{
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            fontSize: 10,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--v3-orange)',
            marginBottom: 4,
          }}
        >
          {eyebrow}
        </div>
        <h3 id="arch-node-detail-title" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
          {title}
        </h3>
      </div>
      <button
        type="button"
        onClick={onClose}
        data-testid="arch-node-detail-close"
        aria-label="Close"
        style={{
          background: 'transparent',
          border: '1px solid var(--v3-line)',
          color: 'var(--v3-ink-md)',
          borderRadius: 6,
          padding: '4px 10px',
          cursor: 'pointer',
          fontSize: 12,
        }}
      >
        Close
      </button>
    </div>
  );
}

function titleFor(detail: ArchitectNodeDetail): string {
  if (detail.kind === 'source') return detail.source.type;
  if (detail.kind === 'watcher') return `L2 · ${detail.watcher.source_type}`;
  if (detail.kind === 'agent') return detail.agent.role;
  return 'Customer dashboard';
}

function eyebrowFor(detail: ArchitectNodeDetail): string {
  if (detail.kind === 'source') return 'Data source';
  if (detail.kind === 'watcher') return 'Watcher · L2';
  if (detail.kind === 'agent') return `Agent · L${detail.layer}`;
  return 'Customer surface';
}

function Body({ detail }: { detail: ArchitectNodeDetail }) {
  if (detail.kind === 'source') {
    const s = detail.source;
    return (
      <div>
        <KV k="Type" v={s.type} />
        <KV k="Jurisdictions" v={(s.jurisdictions ?? []).join(', ') || '—'} />
        <KV k="Expected daily volume" v={String(s.expected_daily_volume ?? '—')} />
      </div>
    );
  }
  if (detail.kind === 'watcher') {
    return (
      <div>
        <KV k="Source type" v={detail.watcher.source_type} />
        <Block label="Instruction">{detail.watcher.instruction}</Block>
      </div>
    );
  }
  if (detail.kind === 'agent') {
    return (
      <div>
        <KV k="Role" v={detail.agent.role} />
        <KV k="Layer" v={`L${detail.layer}`} />
        <Block label="Instruction">{detail.agent.instruction}</Block>
      </div>
    );
  }
  // dashboard
  const e = detail.estimates;
  const bs = detail.businessSummary;
  return (
    <div>
      {bs ? (
        <>
          <Block label="What the customer gets">{bs.what_they_get}</Block>
          <KV k="Lead type" v={bs.lead_type} />
          <KV k="Business area" v={bs.business_area} />
          <Block label="Problem solved">{bs.problem_solved}</Block>
        </>
      ) : null}
      {e ? (
        <>
          <KV k="Daily qualified volume" v={String(e.daily_qualified_volume ?? '—')} />
          <KV k="Cost per lead" v={`$${e.cost_per_lead_usd?.toFixed?.(2) ?? e.cost_per_lead_usd}`} />
          <KV k="Architecture confidence" v={e.architecture_confidence ?? '—'} />
        </>
      ) : null}
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--v3-line-soft)' }}>
      <span style={{ color: 'var(--v3-ink-lo)', fontSize: 12 }}>{k}</span>
      <span style={{ color: 'var(--v3-ink)', fontSize: 13 }}>{v}</span>
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ color: 'var(--v3-ink-lo)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ color: 'var(--v3-ink)', fontSize: 13, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}
