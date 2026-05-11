// NewActionItemModal.tsx — Atrium Work > +New Item
//
// Creates a row in nervous_system.action_items via the
// public.ns_create_action_item_atrium RPC (see
// supabase/migrations/20260511_ns_create_action_item_atrium.sql).
// The RPC writes an action_item_create row into nervous_system.audit_log on
// every successful insert (refusal-gate hook for the manual-create surface).

import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';

type Priority = 'irreversible' | 'high' | 'medium' | 'low';
type KanbanWorkspace = 'pathfinder' | 'metacron' | 'internal' | 'sales';

interface TeamMember {
  id: string;
  name: string;
  email: string | null;
}

const PRIORITIES: Priority[] = ['irreversible', 'high', 'medium', 'low'];
const WORKSPACES: KanbanWorkspace[] = ['pathfinder', 'metacron', 'internal', 'sales'];

export interface NewActionItemModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function NewActionItemModal({ open, onClose, onCreated }: NewActionItemModalProps) {
  const auth = useAuth();
  const signedInEmail = auth.status === 'signed-in' ? auth.user.email ?? null : null;

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [driId, setDriId] = useState<string>('');
  const [workspace, setWorkspace] = useState<KanbanWorkspace | ''>('');
  const [verifyCriteria, setVerifyCriteria] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load team members on open (single fetch, cached for the modal lifecycle).
  useEffect(() => {
    if (!open) return;
    getSupabase()
      .rpc('ns_list_team_members')
      .then(({ data }) => {
        const rows = (data as TeamMember[] | null) ?? [];
        setMembers(rows);
      })
      .catch(() => { /* leave empty — UI shows "Unassigned" */ });
  }, [open]);

  // Default DRI to signed-in user when members arrive.
  useEffect(() => {
    if (!open) return;
    if (driId) return;
    if (!signedInEmail || members.length === 0) return;
    const match = members.find((m) => m.email && m.email.toLowerCase() === signedInEmail.toLowerCase());
    if (match) setDriId(match.id);
  }, [open, driId, signedInEmail, members]);

  // Reset form whenever the modal is reopened.
  useEffect(() => {
    if (open) return;
    setTitle('');
    setPriority('medium');
    setDriId('');
    setWorkspace('');
    setVerifyCriteria('');
    setDescription('');
    setDueDate('');
    setError(null);
    setSubmitting(false);
  }, [open]);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !submitting) onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, submitting, onClose]);

  const canSubmit = useMemo(() => title.trim().length > 0 && !submitting, [title, submitting]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const sb = getSupabase();
      const dueAtIso = dueDate ? new Date(`${dueDate}T23:59:59`).toISOString() : null;
      const { error: rpcError } = await sb.rpc('ns_create_action_item_atrium', {
        p_title:            title.trim(),
        p_priority:         priority,
        p_dri_id:           driId || null,
        p_kanban_workspace: workspace || null,
        p_verify_criteria:  verifyCriteria.trim() || null,
        p_due_at:           dueAtIso,
        p_description:      description.trim() || null,
      });
      if (rpcError) throw rpcError;
      onCreated();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create action item';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={() => { if (!submitting) onClose(); }}
      />

      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-lg bg-white border border-border-default rounded-2xl shadow-xl"
        style={{ boxShadow: '0 24px 64px rgba(11,21,48,0.18)' }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.18em] text-text-muted font-semibold">
              Work &rsaquo; Items
            </div>
            <div className="text-[15px] font-semibold text-text-primary mt-0.5">
              New action item
            </div>
          </div>
          <button
            type="button"
            onClick={() => { if (!submitting) onClose(); }}
            className="text-[12px] text-text-secondary hover:text-text-primary px-2 py-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10.5px] uppercase tracking-[0.16em] text-text-muted font-semibold">
              Title <span className="text-[#E14B4B]">*</span>
            </span>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs doing?"
              className="border border-border-default rounded-md px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-[#6081BE]"
              required
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[10.5px] uppercase tracking-[0.16em] text-text-muted font-semibold">
                Priority
              </span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="border border-border-default rounded-md px-2 py-2 text-[13px] text-text-primary focus:outline-none focus:border-[#6081BE]"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[10.5px] uppercase tracking-[0.16em] text-text-muted font-semibold">
                DRI
              </span>
              <select
                value={driId}
                onChange={(e) => setDriId(e.target.value)}
                className="border border-border-default rounded-md px-2 py-2 text-[13px] text-text-primary focus:outline-none focus:border-[#6081BE]"
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[10.5px] uppercase tracking-[0.16em] text-text-muted font-semibold">
                Board
              </span>
              <select
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value as KanbanWorkspace | '')}
                className="border border-border-default rounded-md px-2 py-2 text-[13px] text-text-primary focus:outline-none focus:border-[#6081BE]"
              >
                <option value="">— none —</option>
                {WORKSPACES.map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[10.5px] uppercase tracking-[0.16em] text-text-muted font-semibold">
                Due
              </span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="border border-border-default rounded-md px-2 py-2 text-[13px] text-text-primary focus:outline-none focus:border-[#6081BE]"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10.5px] uppercase tracking-[0.16em] text-text-muted font-semibold">
              Verify criteria
            </span>
            <textarea
              value={verifyCriteria}
              onChange={(e) => setVerifyCriteria(e.target.value)}
              placeholder="How will we know this is done? (recommended)"
              rows={2}
              className="border border-border-default rounded-md px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-[#6081BE] resize-y"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10.5px] uppercase tracking-[0.16em] text-text-muted font-semibold">
              Description
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional context"
              rows={2}
              className="border border-border-default rounded-md px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-[#6081BE] resize-y"
            />
          </label>

          <div className="text-[11px] text-text-muted">
            Status: <span className="font-semibold text-text-secondary">open</span>
            <span className="mx-2 text-text-faint">·</span>
            Source: <span className="font-semibold text-text-secondary">manual</span>
            <span className="mx-2 text-text-faint">·</span>
            Audit-logged
          </div>

          {error && (
            <div className="bg-[#E14B4B]/10 border border-[#E14B4B]/30 rounded-md px-3 py-2">
              <div className="text-[12px] text-[#E14B4B]">{error}</div>
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-border-default flex justify-end gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={() => { if (!submitting) onClose(); }}
            className="text-[12.5px] font-medium px-3.5 py-2 rounded-md border border-border-default text-text-secondary hover:bg-bg-raised disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="text-[12.5px] font-semibold px-3.5 py-2 rounded-md text-white disabled:opacity-50"
            style={{ background: '#6081BE' }}
          >
            {submitting ? 'Creating…' : 'Create item'}
          </button>
        </div>
      </form>
    </div>
  );
}
