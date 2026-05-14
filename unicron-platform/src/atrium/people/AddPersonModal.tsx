// AddPersonModal.tsx — Atrium People > Add (context-aware)
//
// Goal (2026-05-14): the single "+ Add contact" button on People was a no-op
// and the modal didn't exist. This component is the one modal that adapts its
// title + field set + INSERT RPC to whichever People sub-tab is active:
//
//   customers  → Add Customer       → ns_create_customer
//   team       → Add Team member    → ns_create_team_member
//   network    → Add Contact        → ns_create_network_contact
//   hiring     → Add Applicant      → ns_create_hiring_candidate
//
// On success: closes itself, fires window event 'atrium:people-record-added'
// so the active list view can re-fetch its rows.

import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../lib/supabase';

export type PeopleAddTab = 'customers' | 'team' | 'network' | 'hiring';

interface AddPersonModalProps {
  open: boolean;
  tab: PeopleAddTab;
  onClose: () => void;
  onAdded?: (id: string) => void;
}

type FieldKey =
  | 'name' | 'email' | 'company' | 'role' | 'role_applying'
  | 'stage' | 'arr_usd' | 'slack_user_id' | 'github_username'
  | 'relationship' | 'source' | 'status' | 'resume_url' | 'notes';

interface FieldDef {
  key: FieldKey;
  label: string;
  type: 'text' | 'email' | 'number' | 'textarea' | 'select' | 'url';
  required?: boolean;
  placeholder?: string;
  options?: string[];
}

const CONFIG: Record<PeopleAddTab, { title: string; submit: string; fields: FieldDef[] }> = {
  customers: {
    title: 'Add Customer',
    submit: 'Create customer',
    fields: [
      { key: 'name',    label: 'Name',  type: 'text',     required: true, placeholder: 'e.g. Zedcor' },
      { key: 'stage',   label: 'Stage', type: 'select',   options: ['lead','prospect','pilot','active','at_risk','churned'] },
      { key: 'arr_usd', label: 'ARR (USD)', type: 'number', placeholder: '0' },
      { key: 'notes',   label: 'Notes', type: 'textarea', placeholder: 'Why this customer matters, key contacts, etc.' },
    ],
  },
  team: {
    title: 'Add Team member',
    submit: 'Create team member',
    fields: [
      { key: 'name',            label: 'Name',           type: 'text',   required: true, placeholder: 'Full name' },
      { key: 'email',           label: 'Email',          type: 'email',  placeholder: 'name@unicron.systems' },
      { key: 'role',            label: 'Role',           type: 'select', options: ['founder','cofounder','advisor','contractor','employee'] },
      { key: 'slack_user_id',   label: 'Slack user ID',  type: 'text',   placeholder: 'U01ABCDEFGH (optional)' },
      { key: 'github_username', label: 'GitHub username', type: 'text',  placeholder: 'octocat (optional)' },
    ],
  },
  network: {
    title: 'Add Contact',
    submit: 'Create contact',
    fields: [
      { key: 'name',         label: 'Name',         type: 'text',     required: true, placeholder: 'Full name' },
      { key: 'email',        label: 'Email',        type: 'email',    placeholder: 'name@company.com' },
      { key: 'company',      label: 'Company',      type: 'text',     placeholder: 'Where they work' },
      { key: 'role',         label: 'Role',         type: 'text',     placeholder: 'Title / responsibility' },
      { key: 'relationship', label: 'Relationship', type: 'select',   options: ['advisor','investor','peer','vendor','customer-warm','press','recruit','other'] },
      { key: 'notes',        label: 'Notes',        type: 'textarea', placeholder: 'How you met, what they care about, last touch.' },
    ],
  },
  hiring: {
    title: 'Add Applicant',
    submit: 'Create applicant',
    fields: [
      { key: 'name',          label: 'Name',           type: 'text',     required: true, placeholder: 'Full name' },
      { key: 'email',         label: 'Email',          type: 'email',    placeholder: 'name@email.com' },
      { key: 'role_applying', label: 'Role applying',  type: 'text',     placeholder: 'e.g. Founding engineer' },
      { key: 'source',        label: 'Source',         type: 'select',   options: ['referral','inbound','outbound','linkedin','jobs-board','event','other'] },
      { key: 'status',        label: 'Status',         type: 'select',   options: ['applied','screening','interview','offer','hired','rejected','withdrawn'] },
      { key: 'resume_url',    label: 'Resume URL',     type: 'url',      placeholder: 'https://…' },
      { key: 'notes',         label: 'Notes',          type: 'textarea', placeholder: 'Why they stand out, screening notes.' },
    ],
  },
};

// RPC name + arg keys per tab. Order maps positional plpgsql args in the migration.
const RPC: Record<PeopleAddTab, { fn: string; argMap: Partial<Record<FieldKey, string>> }> = {
  customers: {
    fn: 'ns_create_customer',
    argMap: { name: 'p_name', stage: 'p_stage', arr_usd: 'p_arr_usd', notes: 'p_notes' },
  },
  team: {
    fn: 'ns_create_team_member',
    argMap: {
      name: 'p_name', email: 'p_email', role: 'p_role',
      slack_user_id: 'p_slack_user_id', github_username: 'p_github_username',
    },
  },
  network: {
    fn: 'ns_create_network_contact',
    argMap: {
      name: 'p_name', email: 'p_email', company: 'p_company',
      role: 'p_role', relationship: 'p_relationship', notes: 'p_notes',
    },
  },
  hiring: {
    fn: 'ns_create_hiring_candidate',
    argMap: {
      name: 'p_name', email: 'p_email', role_applying: 'p_role_applying',
      source: 'p_source', status: 'p_status', notes: 'p_notes', resume_url: 'p_resume_url',
    },
  },
};

export function AddPersonModal({ open, tab, onClose, onAdded }: AddPersonModalProps) {
  const config = CONFIG[tab];
  const [values, setValues] = useState<Partial<Record<FieldKey, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset whenever the modal opens or the tab changes.
  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setValues({});
      setSubmitting(false);
      setError(null);
    });
  }, [open, tab]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const canSubmit = useMemo(() => {
    const requiredKeys = config.fields.filter((f) => f.required).map((f) => f.key);
    return requiredKeys.every((k) => (values[k] ?? '').trim().length > 0) && !submitting;
  }, [config.fields, values, submitting]);

  function setField(key: FieldKey, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    const argMap = RPC[tab].argMap;
    const args: Record<string, unknown> = {};
    for (const field of config.fields) {
      const argName = argMap[field.key];
      if (!argName) continue;
      const raw = (values[field.key] ?? '').trim();
      if (!raw) continue;
      if (field.type === 'number') {
        const num = Number(raw);
        if (!Number.isFinite(num)) {
          setError(`${field.label} must be a number.`);
          setSubmitting(false);
          return;
        }
        args[argName] = num;
      } else {
        args[argName] = raw;
      }
    }

    try {
      const sb = getSupabase();
      const { data, error: rpcErr } = await sb.rpc(RPC[tab].fn, args);
      if (rpcErr) {
        setError(rpcErr.message);
        setSubmitting(false);
        return;
      }
      const newId = typeof data === 'string' ? data : null;
      window.dispatchEvent(new CustomEvent('atrium:people-record-added', {
        detail: { tab, id: newId },
      }));
      onAdded?.(newId ?? '');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create record.');
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-xl bg-white border border-border-default rounded-2xl shadow-xl"
        style={{ boxShadow: '0 24px 64px rgba(11,21,48,0.18)' }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.18em] text-text-muted font-semibold">
              People &rsaquo; {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </div>
            <div className="text-[15px] font-semibold text-text-primary mt-0.5">
              {config.title}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="text-[12px] text-text-secondary hover:text-text-primary px-2 py-1">
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-3.5 max-h-[70vh] overflow-y-auto">
          {config.fields.map((f) => (
            <label key={f.key} className="flex flex-col gap-1.5">
              <span className="text-[10.5px] uppercase tracking-[0.16em] text-text-muted font-semibold">
                {f.label}{f.required && <span className="text-[#E14B4B] normal-case font-normal"> *</span>}
              </span>
              {f.type === 'textarea' ? (
                <textarea
                  value={values[f.key] ?? ''}
                  onChange={(e) => setField(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  rows={3}
                  className="border border-border-default rounded-md px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-[#6081BE] resize-y"
                />
              ) : f.type === 'select' ? (
                <select
                  value={values[f.key] ?? ''}
                  onChange={(e) => setField(f.key, e.target.value)}
                  className="border border-border-default rounded-md px-3 py-2 text-[13px] text-text-primary focus:outline-none focus:border-[#6081BE]"
                >
                  <option value="">— select —</option>
                  {f.options?.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.type}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setField(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  className="border border-border-default rounded-md px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-[#6081BE]"
                />
              )}
            </label>
          ))}

          {error && (
            <div className="bg-[#E14B4B]/10 border border-[#E14B4B]/30 rounded-md px-3 py-2 text-[12px] text-[#E14B4B]">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-default bg-bg-card/40">
          <button type="button" onClick={onClose}
            className="px-3 py-2 text-[12px] text-text-secondary hover:text-text-primary">
            Cancel
          </button>
          <button type="submit" disabled={!canSubmit}
            className="px-4 py-2 text-[12px] font-medium text-white bg-[#0B1530] rounded-md hover:bg-[#0B1530]/90 disabled:opacity-50 disabled:cursor-not-allowed">
            {submitting ? 'Creating…' : config.submit}
          </button>
        </div>
      </form>
    </div>
  );
}
