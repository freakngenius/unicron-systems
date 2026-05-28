'use client';

import { useState } from 'react';

type DigestResult =
  | { kind: 'ok'; resend_message_id: string; lead_count: number; recipients: string[] }
  | { kind: 'err'; text: string }
  | null;

export function SendDigestPanel() {
  const [recipients, setRecipients] = useState('team@unicron.systems');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<DigestResult>(null);

  async function handleSend() {
    setSending(true);
    setResult(null);
    const list = recipients
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    try {
      const res = await fetch('/pathfinder/api/zedcor/send-digest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recipients: list }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        resend_message_id?: string;
        lead_count?: number;
        recipients?: string[];
        error?: string;
      };
      if (!res.ok) {
        setResult({ kind: 'err', text: body.error ?? `send-digest returned ${res.status}` });
      } else {
        setResult({
          kind: 'ok',
          resend_message_id: body.resend_message_id ?? 'unknown',
          lead_count: body.lead_count ?? 0,
          recipients: body.recipients ?? list,
        });
      }
    } catch (e) {
      setResult({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <h2 className="text-sm font-semibold text-neutral-900">Send digest</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Emails the latest run&apos;s top-scored leads.
      </p>
      <div className="mt-3 space-y-1">
        <label htmlFor="digest-recipients" className="block text-xs font-medium text-neutral-700">
          Recipients
        </label>
        <input
          id="digest-recipients"
          type="text"
          value={recipients}
          onChange={(e) => setRecipients(e.target.value)}
          className="block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
          placeholder="team@unicron.systems"
        />
        <p className="text-xs text-neutral-400">Comma-separated emails.</p>
      </div>
      <div className="mt-3 flex items-center gap-4">
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || recipients.trim().length === 0}
          className="inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-900 shadow-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? 'Sending…' : 'Send digest'}
        </button>
        <a
          href="/pathfinder/api/zedcor/digest-preview"
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:underline"
        >
          Preview digest →
        </a>
      </div>
      {result?.kind === 'ok' && (
        <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          Sent to {result.recipients.length} recipient{result.recipients.length === 1 ? '' : 's'} ·
          message ID <code className="font-mono">{result.resend_message_id}</code> · lead_count{' '}
          {result.lead_count}
        </div>
      )}
      {result?.kind === 'err' && (
        <div className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
          {result.text}
        </div>
      )}
    </div>
  );
}
