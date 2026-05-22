// POST /api/atrium/voice-transcribe — Whisper-backed audio transcription.
//
// Atrium audit fix item #17 (2026-05-21): replaces the Sprint-4-deferred
// "transcription arrives in Sprint 4" banner in QuickCapture.tsx with a real
// pipeline. The endpoint accepts a base64 audio payload, posts it to OpenAI's
// /v1/audio/transcriptions endpoint (whisper-1), and returns the transcript.
//
// Returns 503 configured:false until OPENAI_API_KEY is set in Vercel env, so
// the UI gracefully degrades to "transcription pending" when creds are absent.
//
// Request:  POST  { base64: string, mime_type: string, filename?: string }
// Response: 200   { configured: true, text: string, model: 'whisper-1', duration_s?: number, fetched_at: ISO }
//           503   { configured: false, message: string }
//           5xx   { configured: true, error: string }

import type { VercelRequest, VercelResponse } from '@vercel/node';

interface PostBody {
  base64?: string;
  mime_type?: string;
  filename?: string;
}

interface WhisperResponse {
  text?: string;
  duration?: number;
  error?: { message?: string };
}

function pickFilename(body: PostBody): string {
  if (body.filename && /^[A-Za-z0-9._-]+$/.test(body.filename)) return body.filename;
  // Derive a safe filename from mime_type.
  const mt = body.mime_type ?? '';
  if (mt.includes('webm')) return 'capture.webm';
  if (mt.includes('mp4'))  return 'capture.mp4';
  if (mt.includes('wav'))  return 'capture.wav';
  if (mt.includes('m4a'))  return 'capture.m4a';
  if (mt.includes('mp3'))  return 'capture.mp3';
  if (mt.includes('ogg'))  return 'capture.ogg';
  return 'capture.webm';
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    res.status(503).json({
      configured: false,
      message:
        'Voice transcription is not connected. Set OPENAI_API_KEY in Vercel env to enable Whisper-backed transcription. ' +
        'Atrium audit fix #17 (2026-05-21) — closeout includes the paste-ready unblock.',
    });
    return;
  }

  let body: PostBody;
  try {
    body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as PostBody;
  } catch {
    res.status(400).json({ configured: true, error: 'Invalid JSON body' });
    return;
  }

  if (!body.base64 || typeof body.base64 !== 'string') {
    res.status(400).json({ configured: true, error: 'Missing field: base64' });
    return;
  }
  if (!body.mime_type || typeof body.mime_type !== 'string') {
    res.status(400).json({ configured: true, error: 'Missing field: mime_type' });
    return;
  }

  // Decode base64 into a Buffer and wrap as multipart/form-data.
  let audioBuf: Buffer;
  try {
    audioBuf = Buffer.from(body.base64, 'base64');
  } catch {
    res.status(400).json({ configured: true, error: 'Invalid base64 payload' });
    return;
  }
  // Refuse silly-large payloads early. Whisper accepts up to 25MB.
  if (audioBuf.byteLength > 25 * 1024 * 1024) {
    res.status(413).json({
      configured: true,
      error: 'Audio payload exceeds 25MB Whisper limit',
    });
    return;
  }

  const filename = pickFilename(body);

  // Build multipart form. Node 18+ runtime on Vercel has Blob + FormData.
  const form = new FormData();
  const blob = new Blob([audioBuf], { type: body.mime_type });
  form.append('file', blob, filename);
  form.append('model', 'whisper-1');
  form.append('response_format', 'json');
  // Optionally pass language hint; Whisper auto-detects so leave unset.

  try {
    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    const text = await whisperRes.text();
    let parsed: WhisperResponse = {};
    try { parsed = JSON.parse(text) as WhisperResponse; } catch { /* leave empty */ }

    if (!whisperRes.ok) {
      res.status(502).json({
        configured: true,
        error: parsed.error?.message ?? `Whisper ${whisperRes.status}: ${text.slice(0, 240)}`,
      });
      return;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      configured: true,
      text: parsed.text ?? '',
      model: 'whisper-1',
      duration_s: parsed.duration ?? null,
      bytes: audioBuf.byteLength,
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(502).json({
      configured: true,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
