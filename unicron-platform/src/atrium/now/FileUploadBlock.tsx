// FileUploadBlock.tsx — Sprint 8 F1
//
// Drop or pick a pdf / image / doc / md / txt / vtt / srt → uploads to the
// Supabase storage bucket 'uploads' (created in migration
// 20260513_uploads_bucket.sql) → calls public.ns_log_file_upload which writes
// a nervous_system.ledger row with source_type='file' + an audit_log entry.
//
// Defensible defaults (overrideable later):
//   max file size : 25 MB
//   allowed mime  : pdf, image/jpeg|png|webp|gif, docx, doc, vtt, srt, txt, md
//
// Per-file status (queued → uploading → done | error) is rendered below the
// drop zone with the audit_log id when present.

import { useCallback, useMemo, useRef, useState } from 'react';
import { getSupabase } from '../../lib/supabase';

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/vtt',
  'application/x-subrip',
  'text/plain',
  'text/markdown',
]);
const ALLOWED_EXT_FALLBACK = new Set([
  '.pdf', '.jpg', '.jpeg', '.png', '.webp', '.gif',
  '.doc', '.docx', '.vtt', '.srt', '.txt', '.md',
]);

interface UploadEntry {
  key: string;
  filename: string;
  size: number;
  mime: string;
  state: 'queued' | 'uploading' | 'done' | 'error';
  message?: string;
  ledger_id?: string;
  file_path?: string;
}

function extensionOk(filename: string): boolean {
  const idx = filename.lastIndexOf('.');
  if (idx < 0) return false;
  return ALLOWED_EXT_FALLBACK.has(filename.slice(idx).toLowerCase());
}

function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_BYTES) {
    return `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB, cap 25 MB)`;
  }
  if (file.type && ALLOWED_MIME.has(file.type)) return null;
  if (extensionOk(file.name)) return null;
  return `Unsupported file type: ${file.type || file.name}`;
}

export function FileUploadBlock({ teamMemberId }: { teamMemberId: string | null }) {
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const disabled = useMemo(() => !teamMemberId, [teamMemberId]);

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const sb = getSupabase();
      const queued: UploadEntry[] = Array.from(fileList).map((f) => {
        const err = validateFile(f);
        return {
          key: `${f.name}-${f.size}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          filename: f.name,
          size: f.size,
          mime: f.type || 'application/octet-stream',
          state: err ? 'error' : 'queued',
          message: err ?? undefined,
        };
      });
      setEntries((prev) => [...queued, ...prev]);

      for (let i = 0; i < fileList.length; i++) {
        const f = fileList.item(i);
        const entry = queued[i];
        if (!f || entry.state === 'error') continue;
        setEntries((prev) =>
          prev.map((e) => (e.key === entry.key ? { ...e, state: 'uploading' } : e)),
        );
        const path = `${teamMemberId ?? 'anon'}/${new Date().toISOString().slice(0, 10)}/${entry.key}-${entry.filename}`;
        const { error: upErr } = await sb.storage.from('uploads').upload(path, f, {
          contentType: entry.mime,
          upsert: false,
        });
        if (upErr) {
          setEntries((prev) =>
            prev.map((e) =>
              e.key === entry.key ? { ...e, state: 'error', message: upErr.message } : e,
            ),
          );
          continue;
        }
        const { data: signed, error: signErr } = await sb.storage
          .from('uploads')
          .createSignedUrl(path, 60 * 60 * 24 * 7);
        const fileUrl = signed?.signedUrl ?? path;
        if (signErr) {
          console.warn('[FileUploadBlock] createSignedUrl failed:', signErr.message);
        }
        const { data: ledgerId, error: rpcErr } = await sb.rpc('ns_log_file_upload', {
          p_storage_path: path,
          p_file_url: fileUrl,
          p_mime: entry.mime,
          p_size_bytes: entry.size,
          p_filename: entry.filename,
          p_uploaded_by: teamMemberId,
        });
        if (rpcErr) {
          setEntries((prev) =>
            prev.map((e) =>
              e.key === entry.key ? { ...e, state: 'error', message: rpcErr.message } : e,
            ),
          );
          continue;
        }
        setEntries((prev) =>
          prev.map((e) =>
            e.key === entry.key
              ? {
                  ...e,
                  state: 'done',
                  ledger_id: typeof ledgerId === 'string' ? ledgerId : undefined,
                  file_path: path,
                }
              : e,
          ),
        );
      }
    },
    [teamMemberId],
  );

  return (
    <div className="bg-bg-card border border-border-default rounded-xl px-4 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--accent)] font-semibold">
          File upload
        </div>
        <span className="mono text-[9px] text-text-muted">
          pdf · image · doc · md · txt · vtt · srt · cap 25 MB
        </span>
      </div>
      <label
        htmlFor="atrium-file-upload-input"
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (disabled) return;
          void handleFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-1 px-3 py-5 rounded-lg border border-dashed text-center cursor-pointer transition-colors ${
          disabled
            ? 'border-border-subtle text-text-muted cursor-not-allowed'
            : dragOver
              ? 'border-[var(--accent)] bg-bg-raised'
              : 'border-border-default hover:border-text-secondary'
        }`}
      >
        <span className="mono text-[11px] text-text-primary">
          {disabled
            ? 'Sign in to upload files'
            : dragOver
              ? 'Drop to upload'
              : 'Drop files or click to browse'}
        </span>
        <input
          id="atrium-file-upload-input"
          ref={inputRef}
          type="file"
          multiple
          disabled={disabled}
          onChange={(e) => {
            void handleFiles(e.target.files);
            if (inputRef.current) inputRef.current.value = '';
          }}
          className="hidden"
        />
      </label>
      {entries.length > 0 && (
        <div className="flex flex-col gap-1 mt-1 max-h-40 overflow-auto">
          {entries.map((e) => (
            <div
              key={e.key}
              className="flex items-center justify-between gap-2 mono text-[10px] px-2 py-1 bg-bg-raised rounded border border-border-subtle"
            >
              <span className="truncate min-w-0 text-text-primary">{e.filename}</span>
              <span className="shrink-0">
                {e.state === 'queued' && <span className="text-text-muted">queued</span>}
                {e.state === 'uploading' && <span className="text-text-secondary">uploading…</span>}
                {e.state === 'done' && (
                  <span className="text-[#2E8E66]">
                    ✓ {e.ledger_id ? `ledger ${e.ledger_id.slice(0, 8)}` : 'done'}
                  </span>
                )}
                {e.state === 'error' && (
                  <span className="text-[#c44]">{e.message ?? 'failed'}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
