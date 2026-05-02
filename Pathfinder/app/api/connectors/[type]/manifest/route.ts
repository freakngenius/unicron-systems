// GET /api/connectors/[type]/manifest?org_id={org}
//
// Per-customer manifest generator (SPEC § 3.4). Operator-gated — non-
// operators get 403, no manifest body. Supported types:
//
//   • slack  → text/yaml YAML body
//   • teams  → application/zip download
//   • hubspot → 404 (uses standard OAuth marketplace, no manifest)
//
// Security review notes (mirrored in the PR description):
//   • Manifest endpoint operator-gated via `isOperatorRequest`.
//   • The manifest body never includes signing secrets, bot passwords,
//     or AAD client secrets — those stay in env. Slack mints fresh
//     tokens after the admin clicks "Install"; Teams reads the bot ID
//     from `TEAMS_BOT_ID` and that's a public identifier.
//   • Generated icons are byte-perfect PNGs constructed locally (no SVG,
//     no foreign-content embedding).
//   • org_id parameter is validated against `[a-z0-9_-]{1,64}` before
//     being surfaced in the manifest body — defends against header-
//     injection and cross-tenant leakage.

import { NextResponse, type NextRequest } from 'next/server';

import { isOperatorRequest } from '@/lib/connectors/auth';
import { generateSlackManifest, slackManifestFilename } from '@/lib/connectors/manifests/slack';
import { generateTeamsPackage } from '@/lib/connectors/manifests/teams';
import { isConnectorType } from '@/lib/connectors/providers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
// Force the Node.js runtime — JSZip + node:zlib are unavailable on edge.
export const runtime = 'nodejs';

/** Org-id validation, mirrors `lib/connectors/auth.ts:resolveOrgId`. */
function isSafeOrgId(value: string): boolean {
  return /^[a-z0-9_-]{1,64}$/i.test(value);
}

/** Compute the Pathfinder origin from the request. Honors the upstream
 *  `x-forwarded-*` headers when set (Vercel + the parent unicron-systems
 *  proxy both populate them) so the manifest URLs match the public host
 *  rather than the underlying Vercel deploy hostname. */
function originFromRequest(req: NextRequest): string {
  const fwdHost = req.headers.get('x-forwarded-host');
  const fwdProto = req.headers.get('x-forwarded-proto');
  if (fwdHost && fwdProto) {
    // Pathfinder is mounted at /pathfinder when proxied — surface that
    // path-prefix so the manifest's redirect_urls resolve through the
    // same proxy the Settings UI uses.
    return `${fwdProto}://${fwdHost}/pathfinder`;
  }
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET(req: NextRequest, { params }: { params: { type: string } }) {
  // 1. Operator gating — non-operators get 403 so the manifest body is
  //    never disclosed to a customer who could pivot it into a phishing
  //    install.
  if (!isOperatorRequest(req)) {
    return NextResponse.json({ error: 'forbidden', code: 'operator_required' }, { status: 403 });
  }

  // 2. Connector type gating.
  const typeParam = params.type.toLowerCase();
  if (!isConnectorType(typeParam)) {
    return NextResponse.json(
      { error: 'unknown_connector_type', allowed: ['slack', 'teams'] },
      { status: 400 },
    );
  }

  // HubSpot uses the public OAuth marketplace — no manifest needed.
  if (typeParam === 'hubspot') {
    return NextResponse.json(
      {
        error: 'manifest_not_supported',
        reason:
          'HubSpot uses the standard OAuth marketplace flow; no per-org manifest is generated.',
      },
      { status: 404 },
    );
  }

  // 3. Org id — required and validated.
  const url = new URL(req.url);
  const orgId = (url.searchParams.get('org_id') ?? '').trim();
  if (!orgId) {
    return NextResponse.json({ error: 'org_id is required' }, { status: 400 });
  }
  if (!isSafeOrgId(orgId)) {
    return NextResponse.json(
      { error: 'org_id must match [a-z0-9_-]{1,64}' },
      { status: 400 },
    );
  }

  const baseUrl = originFromRequest(req);

  try {
    if (typeParam === 'slack') {
      const generated = generateSlackManifest({ orgId, baseUrl });
      const filename = slackManifestFilename(orgId);
      return new NextResponse(generated.body, {
        status: 200,
        headers: {
          'Content-Type': 'application/x-yaml; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }

    // teams — Buffer body needs to be wrapped as an ArrayBuffer / Blob so
    // NextResponse's BodyInit typing accepts it (Buffer extends Uint8Array
    // at runtime but TS's lib.dom.d.ts BodyInit is narrower).
    const teamsPkg = await generateTeamsPackage({
      orgId,
      baseUrl,
      botId: process.env.TEAMS_BOT_ID,
    });
    const zipBlob = new Blob([new Uint8Array(teamsPkg.body)], {
      type: 'application/zip',
    });
    return new NextResponse(zipBlob, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${teamsPkg.filename}"`,
        'Cache-Control': 'private, no-store',
        'Content-Length': String(teamsPkg.body.length),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'manifest_generation_failed', message },
      { status: 500 },
    );
  }
}
