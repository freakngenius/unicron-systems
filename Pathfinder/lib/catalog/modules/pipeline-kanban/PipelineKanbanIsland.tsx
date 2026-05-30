'use client';

// lib/catalog/modules/pipeline-kanban/PipelineKanbanIsland.tsx, Stream D.
//
// Client island owning drag-and-drop state for the Internal pipeline-kanban
// module. HTML5 native drag is used (no external DnD library) to match the
// Zedcor reference at components/pipeline/PipelineKanban.tsx and avoid a
// 30-50KB bundle add.
//
// On drop, the island optimistically moves the card, posts to the existing
// /pathfinder/api/deals/[id]/stage endpoint with the DealPipelineStage enum
// mapped from the Internal stage, and reverts on a non-2xx response.
//
// Card click navigates to the Stream C detail route via the org-context
// nav helper (orgPaths.leadDetail) so the org slug is never dropped from
// the href, even for project ids containing reserved URL chars.

import * as React from 'react';

import { Card, color, EmptyState, font, fontSize, fontWeight, letterSpacing, radius, ScoreBadge, space } from '@/components/design';
import { orgPaths } from '@/lib/nav/orgPath';

import {
  INTERNAL_TO_DEAL,
  type InternalPipelineStage,
} from './internalStageMap';

export interface IslandDealCard {
  dealId: string;
  projectId: string;
  companyName: string;
  score: number | null;
  serviceCategory: string | null;
  stage: InternalPipelineStage;
}

export interface PipelineKanbanIslandProps {
  orgSlug: string;
  stages: readonly InternalPipelineStage[];
  stageLabels: Record<string, string>;
  initialBuckets: Record<InternalPipelineStage, IslandDealCard[]>;
}

interface StageMoveResponse {
  deal?: { id: string; pipeline_stage: string; updated_at?: string };
  noop?: boolean;
  error?: string;
}

const STAGE_ACCENT: Record<InternalPipelineStage, string> = {
  'new-outreach-ready': color.accent,
  contacted: color.accent,
  'in-conversation': color.scoreMid,
  'demo-scheduled': color.scoreHi,
  proposal: color.scoreHi,
  won: color.scoreMid,
  lost: color.textDim,
};

export function PipelineKanbanIsland({
  orgSlug,
  stages,
  stageLabels,
  initialBuckets,
}: PipelineKanbanIslandProps): React.ReactElement {
  const [buckets, setBuckets] =
    React.useState<Record<InternalPipelineStage, IslandDealCard[]>>(initialBuckets);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = React.useState<InternalPipelineStage | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const allCards = React.useMemo<IslandDealCard[]>(
    () => stages.flatMap((s) => buckets[s] ?? []),
    [stages, buckets],
  );

  const handleDrop = React.useCallback(
    async (dealId: string, toStage: InternalPipelineStage) => {
      setDraggingId(null);
      setDragOverStage(null);
      const target = allCards.find((c) => c.dealId === dealId);
      if (!target) return;
      if (target.stage === toStage) return;

      const fromStage = target.stage;

      setBuckets((prev) => {
        const next: Record<InternalPipelineStage, IslandDealCard[]> = { ...prev };
        next[fromStage] = (prev[fromStage] ?? []).filter((c) => c.dealId !== dealId);
        next[toStage] = [...(prev[toStage] ?? []), { ...target, stage: toStage }];
        return next;
      });

      try {
        const res = await fetch(`/pathfinder/api/deals/${encodeURIComponent(dealId)}/stage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ to_stage: INTERNAL_TO_DEAL[toStage] }),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new Error(detail || `HTTP ${res.status}`);
        }
        const json = (await res.json().catch(() => ({}))) as StageMoveResponse;
        if (json.error) throw new Error(json.error);
      } catch (e) {
        setBuckets((prev) => {
          const next: Record<InternalPipelineStage, IslandDealCard[]> = { ...prev };
          next[toStage] = (prev[toStage] ?? []).filter((c) => c.dealId !== dealId);
          next[fromStage] = [...(prev[fromStage] ?? []), { ...target, stage: fromStage }];
          return next;
        });
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [allCards],
  );

  if (allCards.length === 0) {
    return (
      <div data-pipeline-kanban-empty style={{ padding: space.xl }}>
        <EmptyState
          eyebrow="Pipeline"
          title="No deals yet"
          body="When the morning digest verifies a company, it lands here in New / Outreach Ready."
        />
      </div>
    );
  }

  return (
    <div
      data-pipeline-kanban-island
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: space.lg,
      }}
    >
      {error ? (
        <div
          role="alert"
          data-pipeline-kanban-error
          style={{
            padding: `${space.sm}px ${space.md}px`,
            border: `1px solid ${color.danger}`,
            borderRadius: radius.md,
            color: color.danger,
            fontFamily: font.sans,
            fontSize: fontSize.sm,
          }}
        >
          {error}
        </div>
      ) : null}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${stages.length}, minmax(220px, 1fr))`,
          gap: space.md,
          alignItems: 'start',
        }}
      >
        {stages.map((stage) => {
          const items = buckets[stage] ?? [];
          const label = stageLabels[stage] ?? stage;
          const accent = STAGE_ACCENT[stage];
          return (
            <KanbanColumn
              key={stage}
              stage={stage}
              accent={accent}
              label={label}
              items={items}
              orgSlug={orgSlug}
              isDragOver={dragOverStage === stage}
              draggingId={draggingId}
              onDragEnter={() => setDragOverStage(stage)}
              onDragLeave={() => setDragOverStage((curr) => (curr === stage ? null : curr))}
              onDragStart={(id) => setDraggingId(id)}
              onDrop={(id) => handleDrop(id, stage)}
            />
          );
        })}
      </div>
    </div>
  );
}

interface KanbanColumnProps {
  stage: InternalPipelineStage;
  accent: string;
  label: string;
  items: IslandDealCard[];
  orgSlug: string;
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
  items,
  orgSlug,
  isDragOver,
  draggingId,
  onDragEnter,
  onDragLeave,
  onDragStart,
  onDrop,
}: KanbanColumnProps): React.ReactElement {
  return (
    <section
      data-pipeline-column={stage}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        onDragEnter();
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        onDragLeave();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain');
        if (id) onDrop(id);
      }}
      style={{
        background: isDragOver ? color.accentSoft : color.bgSubtle,
        border: `1px solid ${isDragOver ? color.borderStrong : color.border}`,
        borderRadius: radius.lg,
        padding: space.md,
        minHeight: 200,
        transition: 'border-color 120ms ease, background 120ms ease',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: space.md,
          padding: `${space.xs}px ${space.xs}px`,
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: space.xs,
            fontFamily: font.sans,
            fontSize: fontSize.eyebrow,
            fontWeight: fontWeight.semi,
            letterSpacing: letterSpacing.wider,
            textTransform: 'uppercase',
            color: color.text,
          }}
        >
          <span
            aria-hidden
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
          style={{
            fontFamily: font.mono,
            fontSize: fontSize.micro,
            color: color.textMuted,
          }}
        >
          {items.length}
        </span>
      </header>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
        {items.map((item) => (
          <DealCardView
            key={item.dealId}
            card={item}
            orgSlug={orgSlug}
            isDragging={draggingId === item.dealId}
            onDragStart={() => onDragStart(item.dealId)}
          />
        ))}
        {items.length === 0 ? (
          <div
            style={{
              padding: `${space.md}px ${space.sm}px`,
              fontFamily: font.sans,
              fontSize: fontSize.micro,
              color: color.textDim,
              textAlign: 'center',
            }}
          >
            No companies in this stage
          </div>
        ) : null}
      </div>
    </section>
  );
}

interface DealCardViewProps {
  card: IslandDealCard;
  orgSlug: string;
  isDragging: boolean;
  onDragStart: () => void;
}

function DealCardView({ card, orgSlug, isDragging, onDragStart }: DealCardViewProps): React.ReactElement {
  const href = orgPaths.leadDetail(orgSlug, card.projectId);
  return (
    <a
      href={href}
      draggable
      data-pipeline-card={card.dealId}
      data-pipeline-project={card.projectId}
      data-pipeline-stage={card.stage}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', card.dealId);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      style={{
        textDecoration: 'none',
        color: 'inherit',
        opacity: isDragging ? 0.5 : 1,
        cursor: 'grab',
        display: 'block',
      }}
    >
      <Card variant="default" padded={false} style={{ padding: `${space.sm}px ${space.md}px` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.sm }}>
          <span
            style={{
              fontFamily: font.sans,
              fontSize: fontSize.sm,
              fontWeight: fontWeight.semi,
              color: color.text,
              lineHeight: 1.3,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
            title={card.companyName}
          >
            {card.companyName}
          </span>
          <ScoreBadge score={card.score} size="sm" />
        </div>
        {card.serviceCategory ? (
          <div
            style={{
              marginTop: space.xs,
              fontFamily: font.sans,
              fontSize: fontSize.micro,
              color: color.textMuted,
            }}
          >
            {card.serviceCategory}
          </div>
        ) : null}
      </Card>
    </a>
  );
}
