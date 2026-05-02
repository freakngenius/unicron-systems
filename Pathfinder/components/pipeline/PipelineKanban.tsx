'use client';

// PipelineKanban — Stream B Gate B1.
//
// 7-column Kanban (NEW / CONTACTED / REPLIED / MEETING / PROPOSAL / WON /
// LOST). Drag-to-move is implemented via native HTML5 drag-and-drop — no
// external DnD library because react-dnd / @dnd-kit add 30-50KB and the
// Kanban only needs card-to-column moves with optimistic updates.
//
// Design system: PF_TINTS + the same Card/Row/Button primitives as the
// settings sections. Match Lead Detail (ProjectModal) visual language.

import * as React from 'react';

import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';
import {
  DEAL_PIPELINE_STAGES,
  type DealPipelineStage,
  type DealWithProject,
} from '@/lib/types';

interface PipelineKanbanProps {
  initialDeals: DealWithProject[];
  loadError: string | null;
}

interface DealMoveResponse {
  deal: { id: string; pipeline_stage: DealPipelineStage; updated_at?: string };
  noop?: boolean;
}

const STAGE_LABELS: Record<DealPipelineStage, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  REPLIED: 'Replied',
  MEETING: 'Meeting',
  PROPOSAL: 'Proposal',
  WON: 'Won',
  LOST: 'Lost',
};

// Each stage gets a small accent color for the column header badge. Reuses
// the existing PF_TINTS palette — no new color tokens.
const STAGE_ACCENTS: Record<DealPipelineStage, string> = {
  NEW: PF_TINTS.inkDim,
  CONTACTED: PF_TINTS.hi,
  REPLIED: PF_TINTS.warm,
  MEETING: PF_TINTS.amber,
  PROPOSAL: PF_TINTS.violet,
  WON: '#16a34a',
  LOST: '#9ca3af',
};

function formatValue(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

export function PipelineKanban({ initialDeals, loadError }: PipelineKanbanProps) {
  const [deals, setDeals] = React.useState<DealWithProject[]>(initialDeals);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = React.useState<DealPipelineStage | null>(null);
  const [error, setError] = React.useState<string | null>(loadError);

  const dealsByStage = React.useMemo(() => {
    const map = new Map<DealPipelineStage, DealWithProject[]>();
    for (const stage of DEAL_PIPELINE_STAGES) map.set(stage, []);
    for (const d of deals) {
      const list = map.get(d.pipeline_stage);
      if (list) list.push(d);
    }
    return map;
  }, [deals]);

  const handleDrop = React.useCallback(
    async (dealId: string, toStage: DealPipelineStage) => {
      setDraggingId(null);
      setDragOverStage(null);

      const target = deals.find((d) => d.id === dealId);
      if (!target) return;
      if (target.pipeline_stage === toStage) return;

      // Optimistic update
      const previous = target.pipeline_stage;
      setDeals((prev) =>
        prev.map((d) => (d.id === dealId ? { ...d, pipeline_stage: toStage } : d)),
      );

      try {
        const res = await fetch(`/pathfinder/api/deals/${dealId}/stage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ to_stage: toStage }),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new Error(detail || `HTTP ${res.status}`);
        }
        const json = (await res.json()) as DealMoveResponse;
        if (json && json.deal && typeof json.deal === 'object') {
          // Reconcile updated_at + any server-side stage normalization
          setDeals((prev) =>
            prev.map((d) => (d.id === dealId ? { ...d, ...(json.deal as Partial<DealWithProject>) } : d)),
          );
        }
      } catch (e) {
        // Revert
        setDeals((prev) =>
          prev.map((d) => (d.id === dealId ? { ...d, pipeline_stage: previous } : d)),
        );
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [deals],
  );

  return (
    <main
      style={{
        minHeight: '100vh',
        background: PF_TINTS.bgAlt,
        padding: '24px 24px 48px',
        font: `400 14px ${PF_TINTS.sans}`,
        color: PF_TINTS.ink,
      }}
    >
      <header style={{ marginBottom: 18 }}>
        <h1
          style={{
            margin: 0,
            font: `600 22px ${PF_TINTS.sans}`,
            letterSpacing: '-0.01em',
          }}
        >
          Pipeline
        </h1>
        <p
          style={{
            margin: '4px 0 0',
            font: `400 13px ${PF_TINTS.sans}`,
            color: PF_TINTS.inkDim,
          }}
        >
          Drag a card to move a deal through the stages. Stage transitions are logged to{' '}
          <span className="pf-mono" style={{ font: `500 12px ${PF_TINTS.mono}` }}>
            deal_activities
          </span>
          .
        </p>
        {error && (
          <div
            role="alert"
            style={{
              marginTop: 10,
              padding: '8px 12px',
              border: `1px solid ${hexAlpha('#dc2626', 0.4)}`,
              background: hexAlpha('#dc2626', 0.06),
              color: '#b91c1c',
              borderRadius: PF_TINTS.r.sm,
              font: `500 12px ${PF_TINTS.sans}`,
            }}
          >
            {error}
          </div>
        )}
      </header>

      <div
        data-testid="pipeline-kanban"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${DEAL_PIPELINE_STAGES.length}, minmax(220px, 1fr))`,
          gap: 12,
          alignItems: 'start',
        }}
      >
        {DEAL_PIPELINE_STAGES.map((stage) => (
          <KanbanColumn
            key={stage}
            stage={stage}
            accent={STAGE_ACCENTS[stage]}
            label={STAGE_LABELS[stage]}
            deals={dealsByStage.get(stage) ?? []}
            isDragOver={dragOverStage === stage}
            draggingId={draggingId}
            onDragEnter={() => setDragOverStage(stage)}
            onDragLeave={() => setDragOverStage((curr) => (curr === stage ? null : curr))}
            onDragStart={(id) => setDraggingId(id)}
            onDrop={(id) => handleDrop(id, stage)}
          />
        ))}
      </div>
    </main>
  );
}

interface KanbanColumnProps {
  stage: DealPipelineStage;
  accent: string;
  label: string;
  deals: DealWithProject[];
  isDragOver: boolean;
  draggingId: string | null;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDragStart: (id: string) => void;
  onDrop: (id: string) => void;
}

function KanbanColumn({
  stage,
  accent,
  label,
  deals,
  isDragOver,
  draggingId,
  onDragEnter,
  onDragLeave,
  onDragStart,
  onDrop,
}: KanbanColumnProps) {
  return (
    <section
      data-testid={`kanban-column-${stage}`}
      data-stage={stage}
      onDragOver={(e) => {
        // Required to enable drop. Without preventDefault here,
        // onDrop never fires.
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        onDragEnter();
      }}
      onDragLeave={(e) => {
        // Only trigger leave when we exit the column entirely (not when
        // moving between child cards). currentTarget is the column.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        onDragLeave();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain');
        if (id) onDrop(id);
      }}
      style={{
        background: isDragOver ? hexAlpha(accent, 0.05) : PF_TINTS.bg,
        border: `1px solid ${isDragOver ? accent : PF_TINTS.ruleSoft}`,
        borderRadius: PF_TINTS.r.md,
        boxShadow: PF_TINTS.shadow.sm,
        padding: 10,
        minHeight: 180,
        transition: 'border-color 120ms ease, background 120ms ease',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
          padding: '2px 4px',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            font: `600 11px ${PF_TINTS.sans}`,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: PF_TINTS.ink,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: accent,
            }}
          />
          {label}
        </span>
        <span
          className="pf-mono"
          style={{
            font: `500 11px ${PF_TINTS.mono}`,
            color: PF_TINTS.inkDim,
          }}
        >
          {deals.length}
        </span>
      </header>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {deals.map((deal) => (
          <DealCard
            key={deal.id}
            deal={deal}
            isDragging={draggingId === deal.id}
            onDragStart={() => onDragStart(deal.id)}
          />
        ))}
        {deals.length === 0 && (
          <div
            style={{
              padding: '14px 8px',
              font: `400 12px ${PF_TINTS.sans}`,
              color: PF_TINTS.inkFaint,
              textAlign: 'center',
            }}
          >
            No deals
          </div>
        )}
      </div>
    </section>
  );
}

interface DealCardProps {
  deal: DealWithProject;
  isDragging: boolean;
  onDragStart: () => void;
}

function DealCard({ deal, isDragging, onDragStart }: DealCardProps) {
  return (
    <article
      draggable
      data-testid={`deal-card-${deal.id}`}
      data-deal-id={deal.id}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', deal.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      style={{
        background: PF_TINTS.bg,
        border: `1px solid ${PF_TINTS.ruleSoft}`,
        borderRadius: PF_TINTS.r.sm,
        padding: '10px 12px',
        cursor: 'grab',
        opacity: isDragging ? 0.5 : 1,
        transition: 'opacity 120ms ease, box-shadow 120ms ease',
        boxShadow: isDragging ? PF_TINTS.shadow.md : 'none',
      }}
    >
      <div
        style={{
          font: `600 13px ${PF_TINTS.sans}`,
          color: PF_TINTS.ink,
          lineHeight: 1.3,
          marginBottom: 4,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
        title={deal.project.title}
      >
        {deal.project.title}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          font: `500 11px ${PF_TINTS.mono}`,
          color: PF_TINTS.inkDim,
        }}
      >
        <span>{formatValue(deal.value_usd ?? deal.project.project_value)}</span>
        {typeof deal.project.score === 'number' && (
          <>
            <span aria-hidden="true">·</span>
            <span>SCORE {deal.project.score}</span>
          </>
        )}
        {deal.project.distance_miles != null && (
          <>
            <span aria-hidden="true">·</span>
            <span>{deal.project.distance_miles.toFixed(0)} mi</span>
          </>
        )}
      </div>
      {deal.owner_email && (
        <div
          style={{
            marginTop: 6,
            font: `400 11px ${PF_TINTS.sans}`,
            color: PF_TINTS.inkSub,
          }}
        >
          {deal.owner_email}
        </div>
      )}
    </article>
  );
}
