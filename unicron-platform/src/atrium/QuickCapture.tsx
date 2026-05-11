// QuickCapture — modal/drawer for ad-hoc capture (text, photo, voice).
// Posts to /api/ingest with source_type='manual' | 'voice_memo'.
// Sprint 2: text + photo functional; voice accepts recording but server
// returns not_yet_implemented (transcription arrives Sprint 4).

import { useState, useRef, useCallback, type ChangeEvent } from 'react';
import { useAuth } from '../lib/auth';

type CaptureTab = 'text' | 'photo' | 'voice';

type Props = {
  open: boolean;
  onClose: () => void;
  onToast: (text: string) => void;
  teamMemberId?: string | null;
};

const INGEST_API_KEY = import.meta.env.VITE_UNICRON_INGEST_API_KEY as string | undefined;

async function postIngest(body: Record<string, unknown>, signal?: AbortSignal): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (INGEST_API_KEY) headers['x-unicron-api-key'] = INGEST_API_KEY;

  const res = await fetch('/api/ingest', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((err as { message?: string }).message ?? 'ingest failed');
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function QuickCapture({ open, onClose, onToast, teamMemberId }: Props) {
  const auth = useAuth();
  const userId = auth.status === 'signed-in' ? auth.user.id : null;

  const [tab, setTab] = useState<CaptureTab>('text');
  const [textValue, setTextValue] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Voice recording state
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const resetState = useCallback(() => {
    setTextValue('');
    setPhotoFile(null);
    setAudioBlob(null);
    setAudioUrl(null);
    setError(null);
    setRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  function handleClose() {
    resetState();
    onClose();
  }

  async function handleTextSubmit() {
    if (!textValue.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await postIngest({
        source_type: 'manual',
        raw_content: textValue.trim(),
        captured_by: { type: 'human', id: teamMemberId ?? userId },
      });
      onToast('Captured. The Orchestrator will route it.');
      resetState();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePhotoSubmit() {
    if (!photoFile) return;
    setSubmitting(true);
    setError(null);
    try {
      const base64 = await fileToBase64(photoFile);
      await postIngest({
        source_type: 'manual',
        raw_content: `[Photo: ${photoFile.name}]`,
        evidence: { type: 'image', base64, mime_type: photoFile.type, filename: photoFile.name },
        captured_by: { type: 'human', id: teamMemberId ?? userId },
      });
      onToast('Captured. The Orchestrator will route it.');
      resetState();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVoiceSubmit() {
    if (!audioBlob) return;
    setSubmitting(true);
    setError(null);
    try {
      // Convert blob to base64
      const reader = new FileReader();
      const base64: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });
      await postIngest({
        source_type: 'voice_memo',
        raw_content: '[Voice memo — transcription pending]',
        evidence: { type: 'audio', base64, mime_type: audioBlob.type },
        captured_by: { type: 'human', id: teamMemberId ?? userId },
      });
      onToast('Captured. The Orchestrator will route it.');
      resetState();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      setRecording(true);
    } catch (e) {
      setError('Microphone access denied. Check browser permissions.');
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  function onPhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setPhotoFile(file);
    setError(null);
  }

  if (!open) return null;

  const TABS: { id: CaptureTab; label: string }[] = [
    { id: 'text', label: 'Text' },
    { id: 'photo', label: 'Photo' },
    { id: 'voice', label: 'Voice' },
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className="relative bg-white border border-border-default rounded-xl shadow-xl w-full max-w-lg"
        style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
          <div className="mono text-[11px] uppercase tracking-[0.22em] text-text-primary">
            Quick Capture
          </div>
          <button
            onClick={handleClose}
            className="mono text-[11px] text-text-secondary hover:text-text-primary transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border-default">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setError(null); }}
              className={[
                'flex-1 py-3 mono text-[11px] uppercase tracking-[0.16em] transition-colors',
                tab === t.id
                  ? 'text-[#E8763A] border-b-2 border-[#E8763A]'
                  : 'text-text-secondary hover:text-text-primary',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="p-5">
          {/* Text tab */}
          {tab === 'text' && (
            <div className="space-y-4">
              <textarea
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                placeholder="What's on your mind? A note, a decision, an observation…"
                rows={5}
                className="w-full bg-bg-raised border border-border-default rounded-lg px-3 py-2 mono text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-strong resize-none"
                autoFocus
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleTextSubmit();
                }}
              />
              <div className="flex justify-between items-center">
                <span className="mono text-[10px] text-text-muted">⌘↵ to submit</span>
                <button
                  onClick={handleTextSubmit}
                  disabled={submitting || !textValue.trim()}
                  className="mono text-[12px] uppercase tracking-[0.14em] bg-[#E8763A] text-white px-4 py-2 rounded-lg hover:bg-[#D4652E] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Sending…' : 'Capture →'}
                </button>
              </div>
            </div>
          )}

          {/* Photo tab */}
          {tab === 'photo' && (
            <div className="space-y-4">
              <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-border-default rounded-lg cursor-pointer hover:border-[#E8763A] transition-colors bg-bg-raised">
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={onPhotoChange}
                />
                {photoFile ? (
                  <div className="text-center px-4">
                    <div className="mono text-[13px] text-text-primary truncate">{photoFile.name}</div>
                    <div className="mono text-[10px] text-text-muted mt-1">
                      {(photoFile.size / 1024).toFixed(0)} KB — click to change
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="mono text-[11px] uppercase tracking-[0.16em] text-text-secondary">
                      Click to select image
                    </div>
                    <div className="mono text-[10px] text-text-muted mt-1">
                      JPG, PNG, HEIC, WEBP
                    </div>
                  </div>
                )}
              </label>
              <div className="flex justify-end">
                <button
                  onClick={handlePhotoSubmit}
                  disabled={submitting || !photoFile}
                  className="mono text-[12px] uppercase tracking-[0.14em] bg-[#E8763A] text-white px-4 py-2 rounded-lg hover:bg-[#D4652E] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Uploading…' : 'Capture →'}
                </button>
              </div>
            </div>
          )}

          {/* Voice tab */}
          {tab === 'voice' && (
            <div className="space-y-4">
              {/* Sprint 4 banner */}
              <div className="bg-bg-raised border border-[#C28A1F]/30 rounded-lg px-4 py-3">
                <div className="mono text-[10px] uppercase tracking-[0.16em] text-[#C28A1F] mb-1">
                  Sprint 4 Feature
                </div>
                <div className="mono text-[11px] text-text-secondary">
                  Voice transcription arrives in Sprint 4. Your recording is captured and stored —
                  transcription will be applied retroactively.
                </div>
              </div>

              <div className="flex flex-col items-center gap-4 py-4">
                {!recording && !audioUrl && (
                  <button
                    onClick={startRecording}
                    className="w-16 h-16 rounded-full bg-[#E14B4B] flex items-center justify-center hover:bg-[#C85252] transition-colors shadow-lg"
                    aria-label="Start recording"
                  >
                    <div className="w-6 h-6 rounded-full bg-white" />
                  </button>
                )}

                {recording && (
                  <button
                    onClick={stopRecording}
                    className="w-16 h-16 rounded-full bg-[#E14B4B] flex items-center justify-center hover:bg-[#C85252] transition-colors shadow-lg animate-pulse"
                    aria-label="Stop recording"
                  >
                    <div className="w-5 h-5 bg-white rounded-sm" />
                  </button>
                )}

                {recording && (
                  <div className="mono text-[11px] uppercase tracking-[0.16em] text-[#E14B4B] animate-pulse">
                    Recording…
                  </div>
                )}

                {audioUrl && !recording && (
                  <div className="w-full space-y-3">
                    <audio src={audioUrl} controls className="w-full" />
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => { setAudioBlob(null); setAudioUrl(null); }}
                        className="mono text-[11px] uppercase tracking-[0.14em] text-text-secondary hover:text-text-primary px-3 py-2 border border-border-default rounded-lg transition-colors"
                      >
                        Discard
                      </button>
                      <button
                        onClick={handleVoiceSubmit}
                        disabled={submitting}
                        className="mono text-[12px] uppercase tracking-[0.14em] bg-[#E8763A] text-white px-4 py-2 rounded-lg hover:bg-[#D4652E] transition-colors disabled:opacity-40"
                      >
                        {submitting ? 'Sending…' : 'Capture →'}
                      </button>
                    </div>
                  </div>
                )}

                {!recording && !audioUrl && (
                  <div className="mono text-[10px] text-text-muted">
                    Tap the circle to record
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-3 bg-[#E14B4B]/10 border border-[#E14B4B]/40 rounded-lg px-3 py-2">
              <div className="mono text-[11px] text-[#E14B4B]">{error}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
