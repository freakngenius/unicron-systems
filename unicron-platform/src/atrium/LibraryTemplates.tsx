// LibraryTemplates.tsx — Sprint 6 Stream C
// Atrium Library > Templates sub-view.
//
// 5 template cards: PRD, SPEC, Prompt, Retro, Decision.
// Click → calls /api/atrium/vault/templates/instantiate → toast + link.

import { useState } from 'react';
import type { TemplateType } from './library/useWikiApi';
import { instantiateTemplate } from './library/useWikiApi';

interface TemplateCard {
  type: TemplateType;
  title: string;
  description: string;
  icon: string;
}

const TEMPLATES: TemplateCard[] = [
  {
    type: 'prd',
    title: 'PRD',
    description: 'Product Requirements Document — problem, solution, success criteria, scope.',
    icon: '📋',
  },
  {
    type: 'spec',
    title: 'SPEC',
    description: 'Technical Specification — architecture, interfaces, acceptance criteria, migration notes.',
    icon: '⚙️',
  },
  {
    type: 'prompt',
    title: 'Prompt',
    description: 'Agent Prompt — role/context, instructions, hard halt conditions, output format.',
    icon: '🤖',
  },
  {
    type: 'retro',
    title: 'Retro',
    description: 'Sprint Retrospective — shipped, not shipped, learnings, next sprint setup.',
    icon: '🔁',
  },
  {
    type: 'decision',
    title: 'Decision',
    description: 'Decision Record — context, decision, consequences, alternatives considered.',
    icon: '⚖️',
  },
];

interface ToastState {
  slug: string;
  type: TemplateType;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LibraryTemplates({
  onNavigateToRepo,
}: {
  onNavigateToRepo?: (slug?: string) => void;
}) {
  const [creating, setCreating] = useState<TemplateType | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [errors, setErrors] = useState<Partial<Record<TemplateType, string>>>({});

  const handleCreate = async (type: TemplateType) => {
    setCreating(type);
    setErrors((prev) => ({ ...prev, [type]: undefined }));
    try {
      const { slug } = await instantiateTemplate(type);
      setToast({ slug, type });
      // Auto-dismiss after 6s
      setTimeout(() => setToast(null), 6000);
    } catch (e: unknown) {
      setErrors((prev) => ({
        ...prev,
        [type]: e instanceof Error ? e.message : String(e),
      }));
    } finally {
      setCreating(null);
    }
  };

  return (
    <div className="max-w-3xl">
      <p className="mono text-[11px] text-[rgba(229,229,231,0.5)] mb-6">
        Click a template to create a pre-filled draft in the vault inbox. The file is committed
        immediately and appears in Repo view.
      </p>

      {/* Template grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {TEMPLATES.map((card) => {
          const isCreating = creating === card.type;
          const cardError = errors[card.type];

          return (
            <button
              key={card.type}
              onClick={() => handleCreate(card.type)}
              disabled={isCreating || creating !== null}
              className={[
                'text-left border rounded-lg p-5 transition-all',
                'hover:border-[rgba(229,229,231,0.2)] focus:outline-none focus:ring-1 focus:ring-[rgba(229,229,231,0.15)]',
                isCreating
                  ? 'border-[#E8763A]/40 opacity-70'
                  : creating !== null
                    ? 'border-border-default opacity-40 cursor-not-allowed'
                    : 'border-border-default hover:bg-bg-raised',
              ].join(' ')}
            >
              <div className="text-xl mb-2">{card.icon}</div>
              <div className="mono text-[13px] text-[#E5E5E7] font-semibold mb-1">
                {card.title}
              </div>
              <div className="mono text-[10px] text-[rgba(229,229,231,0.5)] leading-relaxed">
                {card.description}
              </div>
              {isCreating && (
                <div className="mono text-[10px] text-[#E8763A] mt-3 animate-pulse">
                  Creating…
                </div>
              )}
              {cardError && (
                <div className="mono text-[10px] text-red-400 mt-3 break-words">
                  {cardError}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Success toast */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-bg-panel border border-[rgba(229,229,231,0.15)] rounded-lg px-5 py-3 shadow-lg">
          <div className="mono text-[11px] text-[#E5E5E7]">
            {toast.type.toUpperCase()} created in inbox
          </div>
          <button
            onClick={() => {
              onNavigateToRepo?.(toast.slug);
              setToast(null);
            }}
            className="mono text-[10px] uppercase tracking-[0.14em] text-[#E8763A] hover:opacity-80 transition-opacity"
          >
            Open in Repo →
          </button>
          <button
            onClick={() => setToast(null)}
            className="mono text-[10px] text-text-secondary hover:text-text-primary transition-colors ml-1"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
