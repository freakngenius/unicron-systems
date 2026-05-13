// UploadCallModal.tsx — Atrium Work > Calls > Upload call
//
// Modal that captures a transcript + summary notes + date + participants and
// POSTs to /api/atrium/calls/upload. The server stores the transcript in the
// Notion Call Transcripts DB and writes a row in nervous_system.ledger so the
// call appears in the list immediately.
//
// Inputs supported (Item 1, usefulness-pass 2026-05-12):
//   - Paste transcript text into the textarea, OR
//   - Upload a transcript file (.txt/.md/.docx/.vtt/.srt). Browser-side
//     extraction normalizes .docx (mammoth), strips VTT/SRT timestamps, and
//     pre-fills the textarea so the operator can review/edit before submit.
//   - Same applies to summary notes.
// After file load we run a quick local heuristic to seed Title / Date /
// Participants from the filename + first heading + Attendees/Speaker tags.
// At least one of transcript / summary_notes is required.

import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { extractFromFile, type ExtractResult } from '../../lib/callFileExtract';

interface TeamMember {
  id: string;
  name: string;
  email: string | null;
}

interface ExtractionResult {
  extracted_counts: {
    action_items: number;
    decisions: number;
    customer_mentions: number;
  };
  customer_mentions_result?: {
    dominant_customer_name: string | null;
    count_resolved: number;
    count_unresolved: number;
  };
  errors?: string[];
  skipped_reason?: string;
}

interface UploadResult {
  notion_page_id: string;
  notion_url: string;
  ledger_id: string;
  extraction?: ExtractionResult | null;
  extraction_error?: string | null;
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
  const [extracting, setExtracting] = useState<'transcript' | 'summary' | null>(null);
  const [extractNotice, setExtractNotice] = useState<string | null>(null);

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
    setExtracting(null);
    setExtractNotice(null);
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
    !extracting &&
    (transcript.trim().length > 0 || summaryNotes.trim().length > 0);

  function toggleInternal(name: string) {
    setInternalParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function applyExtractMetadata(meta: ExtractResult, defaultsApply: { title?: boolean; date?: boolean; participants?: boolean }) {
    const notices: string[] = [];
    if (meta.title && (!title.trim() || defaultsApply.title === false)) {
      if (!title.trim()) {
        setTitle(meta.title);
        notices.push(`title: ${meta.title}`);
      }
    }
    if (meta.date && /^\d{4}-\d{2}-\d{2}$/.test(meta.date)) {
      // Only override default-today date — don't stomp user edits
      if (callDate === todayIsoDate()) {
        setCallDate(meta.date);
        notices.push(`date: ${meta.date}`);
      }
    }
    if (meta.participants && meta.participants.length > 0) {
      const knownNames = new Set(members.map((m) => m.name.toLowerCase()));
      const internalMatches: string[] = [];
      const externalLines: string[] = [];
      for (const p of meta.participants) {
        const lc = p.toLowerCase();
        const matched = [...knownNames].find((n) => lc.includes(n));
        if (matched) {
          const original = members.find((m) => m.name.toLowerCase() === matched)!;
          internalMatches.push(original.name);
        } else {
          externalLines.push(p);
        }
      }
      if (internalMatches.length) {
        setInternalParticipants((prev) => {
          const next = new Set(prev);
          for (const n of internalMatches) next.add(n);
          return next;
        });
      }
      if (externalLines.length && !externalParticipantsRaw.trim()) {
        setExternalParticipantsRaw(externalLines.join(', '));
        notices.push(`participants: ${externalLines.length + internalMatches.length}`);
      } else if (internalMatches.length) {
        notices.push(`team participants: ${internalMatches.length}`);
      }
    }
    if (notices.length) setExtractNotice(`Auto-filled — ${notices.join(' · ')}. Override any field before submit.`);
  }

  async function handleFileChange(field: 'transcript' | 'summary', e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-upload of same filename
    if (!file) return;
    setExtracting(field);
    setError(null);
    setExtractNotice(null);
    try {
      const extracted = await extractFromFile(file);
      if (!extracted.text || !extracted.text.trim()) {
        setError(`File "${file.name}" extracted no text. Paste content manually if needed.`);
        return;
      }
      if (field === 'transcript') setTranscript((prev) => prev.trim() ? prev : extracted.text);
      else setSummaryNotes((prev) => prev.trim() ? prev : extracted.text);
      applyExtractMetadata(extracted, {});
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to read ${file.name}`);
    } finally {
      setExtracting(null);
    }
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
              Call stored in Notion + Atrium ledger.
            </div>
            <a
              href={success.notion_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-[12px] text-[#6081BE] hover:underline truncate"
            >
              Open in Notion ›
            </a>

            {success.extraction ? (
              <div className="rounded-md border border-border-default bg-bg-card/40 px-3 py-2 space-y-1">
                <div className="text-[10.5px] uppercase tracking-[0.16em] text-text-muted font-semibold">
                  Processed
                </div>
                <div className="text-[12px] text-text-primary">
                  {success.extraction.extracted_counts.action_items} action item
                  {success.extraction.extracted_counts.action_items === 1 ? '' : 's'},{' '}
                  {success.extraction.extracted_counts.decisions} decision
                  {success.extraction.extracted_counts.decisions === 1 ? '' : 's'},{' '}
                  {success.extraction.extracted_counts.customer_mentions} customer mention
                  {success.extraction.extracted_counts.customer_mentions === 1 ? '' : 's'}
                </div>
                {success.extraction.customer_mentions_result?.dominant_customer_name && (
                  <div className="text-[11px] text-text-muted">
                    Linked to{' '}
                    <span className="text-text-primary font-medium">
                      {success.extraction.customer_mentions_result.dominant_customer_name}
                    </span>
                  </div>
                )}
                {success.extraction.skipped_reason && (
                  <div className="text-[11px] text-[#E8763A]">
                    Extraction skipped: {success.extraction.skipped_reason}
                  </div>
                )}
                {success.extraction.errors && success.extraction.errors.length > 0 && (
                  <div className="text-[11px] text-[#E14B4B]">
                    {success.extraction.errors.length} partial error
                    {success.extraction.errors.length === 1 ? '' : 's'} during fan-out (see logs).
                  </div>
                )}
                <div className="text-[10px] text-text-muted">
                  ledger_id: <span className="font-mono">{success.ledger_id}</span>
                </div>
              </div>
            ) : success.extraction_error ? (
              <div className="rounded-md border border-[#E14B4B]/30 bg-[#E14B4B]/10 px-3 py-2 text-[11px] text-[#E14B4B]">
                Notion + ledger written, but transcript fan-out failed: {success.extraction_error}
              </div>
            ) : (
              <div className="text-[11px] text-text-muted">
                Action items will appear in the Internal Org Kanban once the transcript skill runs.
              </div>
            )}

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

              {extractNotice && (
                <div className="bg-[#6081BE]/10 border border-[#6081BE]/30 rounded-md px-3 py-2 text-[11px] text-[#3D5994]">
                  {extractNotice}
                </div>
              )}

              <label className="flex flex-col gap-1.5">
                <span className="text-[10.5px] uppercase tracking-[0.16em] text-text-muted font-semibold flex items-center gap-2">
                  Full transcript <span className="text-text-faint normal-case font-normal">(paste below OR upload .txt / .md / .docx / .vtt / .srt; either this or summary notes is required)</span>
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept=".txt,.md,.markdown,.docx,.vtt,.srt,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(e) => void handleFileChange('transcript', e)}
                    disabled={!!extracting}
                    className="text-[11px] text-text-secondary file:mr-2 file:px-2 file:py-1 file:rounded-md file:border file:border-border-default file:bg-bg-card file:text-text-secondary file:text-[11px] file:cursor-pointer hover:file:border-border-hover"
                  />
                  {extracting === 'transcript' && (
                    <span className="text-[10px] text-text-muted">Extracting…</span>
                  )}
                </div>
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="Paste the full transcript here, or upload a file above. Long transcripts are chunked automatically."
                  rows={6}
                  className="border border-border-default rounded-md px-3 py-2 text-[12px] font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-[#6081BE] resize-y"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[10.5px] uppercase tracking-[0.16em] text-text-muted font-semibold">
                  Summary notes <span className="text-text-faint normal-case font-normal">(or upload a separate notes file)</span>
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept=".txt,.md,.markdown,.docx,.vtt,.srt,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(e) => void handleFileChange('summary', e)}
                    disabled={!!extracting}
                    className="text-[11px] text-text-secondary file:mr-2 file:px-2 file:py-1 file:rounded-md file:border file:border-border-default file:bg-bg-card file:text-text-secondary file:text-[11px] file:cursor-pointer hover:file:border-border-hover"
                  />
                  {extracting === 'summary' && (
                    <span className="text-[10px] text-text-muted">Extracting…</span>
                  )}
                </div>
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
                {submitting ? 'Uploading & processing…' : 'Upload call'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
