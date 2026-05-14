// UploadCallModal.tsx — Atrium Work > Calls > Upload call
//
// Goal "Fix Atrium call upload end-to-end" — Condition 1 split-of-concerns:
// the modal NO LONGER owns the upload promise or the in-modal success view.
// On submit it validates locally, calls onSubmit(payload), and closes
// immediately. CallsLog (the parent) renders a bottom-of-viewport status bar
// that cycles "Call uploading..." → "Processing transcript..." → "Done: ..."
// with the audit_log id while the upload + transcript pipeline run async.
//
// Inputs supported:
//   - Paste transcript text into the textarea, OR
//   - Upload a transcript file (.txt/.md/.docx/.vtt/.srt). Browser-side
//     extraction normalizes .docx (mammoth), strips VTT/SRT timestamps, and
//     pre-fills the textarea so the operator can review/edit before submit.
//   - Same applies to summary notes.
// At least one of transcript / summary_notes is required.

import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { extractFromFile, type ExtractResult } from '../../lib/callFileExtract';

interface TeamMember {
  id: string;
  name: string;
  email: string | null;
}

export interface UploadSubmitPayload {
  title?: string;
  transcript?: string;
  summary_notes?: string;
  date: string;
  participants: string[];
  source: 'manual_upload';
}

export interface UploadCallModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: UploadSubmitPayload) => void;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function UploadCallModal({ open, onClose, onSubmit }: UploadCallModalProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [title, setTitle] = useState('');
  const [transcript, setTranscript] = useState('');
  const [summaryNotes, setSummaryNotes] = useState('');
  const [callDate, setCallDate] = useState<string>(todayIsoDate());
  const [internalParticipants, setInternalParticipants] = useState<Set<string>>(new Set());
  const [externalParticipantsRaw, setExternalParticipantsRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState<'transcript' | 'summary' | null>(null);
  const [extractNotice, setExtractNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    getSupabase()
      .rpc('ns_list_team_members')
      .then(
        ({ data }) => setMembers((data as TeamMember[] | null) ?? []),
        () => { /* leave empty — user can still type externals */ },
      );
  }, [open]);

  // Form reset on modal close. queueMicrotask defers the setState calls so
  // they don't fire synchronously inside the effect body (React 19 purity
  // rule prohibits the synchronous form).
  useEffect(() => {
    if (open) return;
    queueMicrotask(() => {
      setTitle('');
      setTranscript('');
      setSummaryNotes('');
      setCallDate(todayIsoDate());
      setInternalParticipants(new Set());
      setExternalParticipantsRaw('');
      setError(null);
      setExtracting(null);
      setExtractNotice(null);
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const externalParticipants = useMemo(() => {
    return externalParticipantsRaw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [externalParticipantsRaw]);

  const canSubmit =
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

  function applyExtractMetadata(meta: ExtractResult) {
    const notices: string[] = [];
    if (meta.title && !title.trim()) {
      setTitle(meta.title);
      notices.push(`title: ${meta.title}`);
    }
    if (meta.date && /^\d{4}-\d{2}-\d{2}$/.test(meta.date)) {
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
    e.target.value = '';
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
      applyExtractMetadata(extracted);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to read ${file.name}`);
    } finally {
      setExtracting(null);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const participants = [
      ...Array.from(internalParticipants),
      ...externalParticipants,
    ];
    onSubmit({
      title:         title.trim() || undefined,
      transcript:    transcript.trim() || undefined,
      summary_notes: summaryNotes.trim() || undefined,
      date:          callDate,
      participants,
      source:        'manual_upload',
    });
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
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
            onClick={onClose}
            className="text-[12px] text-text-secondary hover:text-text-primary px-2 py-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

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
            className="px-3 py-2 text-[12px] text-text-secondary hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-4 py-2 text-[12px] font-medium text-white bg-[#0B1530] rounded-md hover:bg-[#0B1530]/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Upload call
          </button>
        </div>
      </form>
    </div>
  );
}
