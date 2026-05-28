// app/api/zedcor/digest-preview/route.ts
//
// Sprint Z1A — GET endpoint that returns the rendered Pathfinder Daily
// Digest HTML with current Notion data. No email send. Kyle bookmarks
// this URL to visually verify the digest before clicking Send Digest.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { buildDigestData } from '@/lib/email/build-digest-data';
import { renderDigest } from '@/lib/email/handlebars-setup';
import { getOperatorIdentity, operatorDenied } from '@/lib/auth/require-operator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function loadTemplate(): Promise<string> {
  const p = path.join(process.cwd(), 'lib', 'email', 'zedcor-digest-template.html');
  return await fs.readFile(p, 'utf-8');
}

export async function GET(): Promise<NextResponse | Response> {
  const auth = await getOperatorIdentity();
  if (!auth.ok) return operatorDenied(auth);

  try {
    const data = await buildDigestData({});
    const template = await loadTemplate();
    const html = renderDigest(template, data);
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
