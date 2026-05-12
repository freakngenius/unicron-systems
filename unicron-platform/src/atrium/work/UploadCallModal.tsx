// UploadCallModal.tsx — Atrium Work > Calls > Upload call
//
// Modal that captures a transcript + summary notes + date + participants and
// POSTs to /api/atrium/calls/upload. The server stores the transcript in the
// Notion Call Transcripts DB and writes a row in nervous_system.ledger so the
// call appears in the list immediately.
//
// At least one of transcript / summary_notes is required. Participants are
// composed from (a) checked canonical team members loaded via
// ns_list_team_members RPC and (b) free-text "external participants" lines.

import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../lib/supabase';

interface TeamMember {
  id: string;
  name: string;
  email: string | null;
}

interface UploadResult {
  notion_page_id: string;
  notion_url: string;
  ledger_id: string;
}

export interface UploadCallModalProps {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function UploadCallModal({ open, onClose, onUploaded }: UploadCallModalProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [title, setTitle] = useState('');
  const [transcript, setTranscript] = useState('');
  const [summaryNotes, setSummaryNotes] = useState('');
  const [callDate, setCallDate] = useState<string>(todayIsoDate());
  const [internalParticipants, setInternalParticipants] = useState<Set<string>>(new Set());
  const [externalParticipantsRaw, setExternalParticipantsRaw] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<UploadResult | null>(null);

  useEffect(() => {
    if (!open) return;
    getSupabase()
      .rpc('ns_list_team_members')
      .then(({ data }) => setMembers((data as TeamMember[] | null) ?? []))
      .catch(() => { /* leave empty — user can still type externals */ });
  }, [open]);

  useEffect(() => {
    if (open) return;
    setTitle('');
    setTranscript('');
    setSummaryNotes('');
    setCallDate(todayIsoDate());
    setInternalParticipants(new Set());
    setExternalParticipantsRaw('');
    setSubmitting(false);
    setError(null);
    setSuccess(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, submitting, onClose]);

  const externalParticipants = useMemo(() => {
    return externalParticipantsRaw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [externalParticipantsRaw]);

  const canSubmit =
    !submitting &&
    (transcript.trim().length > 0 || summaryNotes.trim().length > 0);

  function toggleInternal(name: string) {
    setInternalParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const sb = getSupabase();
      const { data: sessionData } = await sb.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        throw new Error('Not signed in — refresh and sign back in to upload calls.');
      }

      const participants = [
        ...Array.from(internalParticipants),
        ...externalParticipants,
      ];

      const res = await fetch('/api/atrium/calls/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title:        title.trim() || undefined,
          transcript:   transcript.trim() || undefined,
          summary_notes: summaryNotes.trim() || undefined,
          date:         callDate,
          participants,
          source:       'manual_upload',
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        // 207: Notion succeeded but ledger failed — surface partial success.
        if (res.status === 207 && json?.notion_url) {
          setError(
            `Saved to Notion (${json.notion_url}) but local ledger write failed: ${json.ledger_error ?? 'unknown error'}`,
          );
          return;
        }
        throw new Error(json?.error ?? `upload failed (HTTP ${res.status})`);
      }

      setSuccess(json as UploadResult);
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
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
        className="relative w-full max-w-2xl bg-white border border-border-default rounded-2xl shadow-xl"
        style={{ boxShadow: '0 24px 64px rgba(11,21,48,0.18)' }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.18em] text-text-muted font-semibold">
              Work &rsaquo; Calls
            </div>
            <div className="text-[15px] font-semibold text-text-primary mt-0.5">
              Upload call
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

        {success ? (
          <div className="px-5 py-6 space-y-3">
            <div className="text-[13px] text-text-primary font-medium">
              Call stored in Notion + ledger.
            </div>
            <a
              href={success.notion_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-[12px] text-[#6081BE] hover:underline truncate"
            >
              Open in Notion ›
            </a>
            <div className="text-[11px] text-text-muted">
              Action items will appear in the Internal Org Kanban once the transcript skill runs.
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-[12px] text-text-primary border border-border-default rounded-md hover:bg-bg-card"
              >
                Done
              </button>
              <button
                type="button"
                onClick={() => setSuccess(null)}
                className="px-3 py-2 text-[12px] text-text-secondary hover:text-text-primary"
              >
                Upload another
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-5 py-4 space-y-3.5 max-h-[70vh] overflow-y-auto">
              <label className="flex flex-col gap-1.5">
                <span className="text-[10.5px] uppercase tracking-[0.16em] text-text-muted font-semibold">
                  Title <span className="text-text-faint normal-case font-normal">(optional — auto-generated from participants + date)</span>
                </span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Zedcor pilot kickoff"
                  className="border border-border-default rounded-md px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-[#6081BE]"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[10.5px] uppercase tracking-[0.16em] text-text-muted font-semibold">
                  Full transcript <span className="text-text-faint normal-case font-normal">(paste full text; either this or summary notes is required)</span>
                </span>
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="Paste the full transcript here. Long transcripts are chunked automatically."
                  rows={6}
                  className="border border-border-default rounded-md px-3 py-2 text-[12px] font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-[#6081BE] resize-y"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[10.5px] uppercase tracking-[0.16em] text-text-muted font-semibold">
                  Summary notes <span className="text-text-faint normal-case font-normal">(or paste shorthand notes if no transcript)</span>
                </span>
                <textarea
                  value={summaryNotes}
                  onChange={(e) => setSummaryNotes(e.target.value)}
                  placeholder="Quick notes from the call, key topics discussed, decisions reached."
                  rows={3}
                  className="border border-border-default rounded-md px-3 py-2 text-[12px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-[#6081BE] resize-y"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[10.5px] uppercase tracking-[0.16em] text-text-muted font-semibold">
                    Call date
                  </span>
                  <input
                    type="date"
                    value={callDate}
                    onChange={(e) => setCallDate(e.target.value)}
                    className="border border-border-default rounded-md px-3 py-2 text-[13px] text-text-primary focus:outline-none focus:border-[#6081BE]"
                  />
                </label>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[10.5px] uppercase tracking-[0.16em] text-text-muted font-semibold">
                  Participants — team
                </span>
                <div className="flex flex-wrap gap-2">
                  {members.length === 0 && (
                    <span className="text-[11px] text-text-muted italic">No team members found — add externals below.</span>
                  )}
                  {members.map((m) => {
                    const checked = internalParticipants.has(m.name);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleInternal(m.name)}
                        className={
                          'px-2.5 py-1 text-[12px] rounded-md border transition-colors ' +
                          (checked
                            ? 'bg-[#6081BE]/10 border-[#6081BE]/40 text-[#6081BE] font-medium'
                            : 'bg-bg-card border-border-default text-text-secondary hover:border-border-hover')
                        }
                      >
                        {checked ? '✓ ' : ''}{m.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-[10.5px] uppercase tracking-[0.16em] text-text-muted font-semibold">
                  Participants — external <span className="text-text-faint normal-case font-normal">(comma- or newline-separated; written to page body, not multi_select)</span>
                </span>
                <textarea
                  value={externalParticipantsRaw}
                  onChange={(e) => setExternalParticipantsRaw(e.target.value)}
                  placeholder="Jane Doe (Zedcor), John Smith (Vendor)"
                  rows={2}
                  className="border border-border-default rounded-md px-3 py-2 text-[12px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-[#6081BE] resize-y"
                />
              </label>

              {error && (
                <div className="bg-[#E14B4B]/10 border border-[#E14B4B]/30 rounded-md px-3 py-2 text-[12px] text-[#E14B4B]">
                  {error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-default bg-bg-card/40">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-3 py-2 text-[12px] text-text-secondary hover:text-text-primary disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="px-4 py-2 text-[12px] font-medium text-white bg-[#0B1530] rounded-md hover:bg-[#0B1530]/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Uploading…' : 'Upload call'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
