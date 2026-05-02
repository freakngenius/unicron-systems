// lib/connectors/manifests/teams.ts — per-org Microsoft Teams app package.
//
// SPEC § 2.2 Step E + § 3.4: Teams apps install via a `.zip` package that
// contains `manifest.json` (schema 1.16+) and two icons (color 192×192,
// outline 32×32). Pathfinder generates this on the fly per customer so
// the IT admin can sideload via Teams Admin Center.
//
// V1 ships SOLID-COLOR PLACEHOLDER PNGs for the icons. Brand assets get
// swapped in post-pilot — the SPEC explicitly notes that the manifest
// flow is per-tenant and the icons live alongside the manifest in the
// zip, so a future asset swap is a one-line change.
//
// Security:
//   • The manifest body never contains the AAD client secret, the bot
//     password, or any signing material — those stay in Pathfinder env.
//   • The placeholder icons are byte-perfect minimal PNGs constructed
//     locally; no SVG, no foreign-content, no JS embed.
//   • org_id is included only in the bot display name + the package
//     filename so admins can disambiguate installs.

import JSZip from 'jszip';
import { deflateSync } from 'node:zlib';

export interface TeamsManifestArgs {
  /** Customer org id (slugged into the bot name + filename). */
  orgId: string;
  /** Pathfinder origin (e.g. https://www.unicron.systems/pathfinder). */
  baseUrl: string;
  /**
   * Microsoft Bot Framework App ID — read from env in the route handler
   * and threaded in here. Optional in tests so the generator can be
   * exercised without env wiring.
   */
  botId?: string;
}

export interface GeneratedTeamsPackage {
  /** Suggested download filename. */
  filename: string;
  /** The zip body as a Node Buffer. */
  body: Buffer;
  /** The manifest object (for tests + spot-check). */
  manifest: TeamsManifestObject;
}

/** Subset of the Teams manifest schema 1.16 we generate. */
export interface TeamsManifestObject {
  $schema: string;
  manifestVersion: string;
  version: string;
  id: string;
  packageName: string;
  developer: {
    name: string;
    websiteUrl: string;
    privacyUrl: string;
    termsOfUseUrl: string;
  };
  name: { short: string; full: string };
  description: { short: string; full: string };
  icons: { outline: string; color: string };
  accentColor: string;
  bots: Array<{
    botId: string;
    scopes: string[];
    isNotificationOnly: boolean;
    supportsFiles: boolean;
    commandLists: Array<{
      scopes: string[];
      commands: Array<{ title: string; description: string }>;
    }>;
  }>;
  permissions: string[];
  validDomains: string[];
}

const TEAMS_SCHEMA_URL =
  'https://developer.microsoft.com/en-us/json-schemas/teams/v1.16/MicrosoftTeams.schema.json';

const COMMAND_LIST = [
  { title: 'leads', description: 'List the top scored leads' },
  { title: 'rejected', description: 'Show the recent rejected pile' },
  { title: 'feedback', description: 'Record thumbs up/down on a project' },
  { title: 'help', description: 'List all Pathfinder commands' },
];

/** Hash a string to a stable lowercase hex digest. Used to derive the
 *  manifest GUID-ish `id` from `orgId` so re-generation is idempotent. */
function djb2(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  // Convert to unsigned 32-bit hex.
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Build a deterministic v4-shaped UUID for the manifest `id` field.
 *  Teams requires a UUID; we don't need cryptographic uniqueness, just
 *  per-org stability so re-downloads produce the same manifest id. */
function deterministicUuid(seed: string): string {
  const h1 = djb2(`${seed}#1`);
  const h2 = djb2(`${seed}#2`);
  const h3 = djb2(`${seed}#3`);
  const h4 = djb2(`${seed}#4`);
  // Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx (variant bits zeroed
  // out to keep it valid v4-shaped).
  const a = h1; // 8 chars
  const b = h2.slice(0, 4); // 4 chars
  const c = `4${h2.slice(4, 7)}`; // 4 chars, version 4
  const d = `8${h3.slice(0, 3)}`; // 4 chars, variant 10xx
  const e = `${h3.slice(3, 8)}${h4.slice(0, 7)}`; // 12 chars
  return `${a}-${b}-${c}-${d}-${e}`;
}

function assertSafeOrgId(orgId: string): void {
  if (typeof orgId !== 'string' || orgId.length === 0) {
    throw new Error('orgId is required');
  }
  if (orgId.length > 64) {
    throw new Error('orgId must be ≤ 64 chars');
  }
  if (!/^[a-z0-9_-]+$/i.test(orgId)) {
    throw new Error('orgId must match [a-z0-9_-]+');
  }
}

function assertSafeBaseUrl(baseUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error('baseUrl must be a valid absolute URL');
  }
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
    throw new Error('baseUrl must be https (localhost exempted for dev)');
  }
  return parsed;
}

/**
 * Build a minimal valid PNG of a single solid color. PNG layout:
 *   • 8-byte signature
 *   • IHDR chunk (13 bytes payload + length/CRC)
 *   • IDAT chunk (deflated row data)
 *   • IEND chunk
 *
 * Hand-rolling a solid-color PNG keeps the bundle dep-free and
 * deterministic. Width/height are square; rgb is [r,g,b] 0-255.
 *
 * Uses zlib `deflateSync` (Node built-in) for IDAT compression.
 */
function buildSolidPng(size: number, rgb: [number, number, number]): Buffer {
  // Avoid pulling in pngjs; build the chunks manually using node:zlib.
  // We only need this in node (icons are generated server-side).
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(2, 9); // color type 2 = RGB
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  // Raw scanlines: filter byte (0) + size*3 bytes of RGB per row.
  const rowLen = 1 + size * 3;
  const raw = Buffer.alloc(rowLen * size);
  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0; // filter type 0
    for (let x = 0; x < size; x++) {
      const off = y * rowLen + 1 + x * 3;
      raw[off] = rgb[0];
      raw[off + 1] = rgb[1];
      raw[off + 2] = rgb[2];
    }
  }
  const idatBody = deflateSync(raw);

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatBody),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type: string, body: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = crc32(Buffer.concat([typeBuf, body]));
  return Buffer.concat([len, typeBuf, body, crc]);
}

/** Standard PNG CRC-32 (IEEE 802.3 polynomial). */
function crc32(buf: Buffer): Buffer {
  const table = crc32Table();
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  c = (c ^ 0xffffffff) >>> 0;
  const out = Buffer.alloc(4);
  out.writeUInt32BE(c, 0);
  return out;
}

let _crcTable: Uint32Array | null = null;
function crc32Table(): Uint32Array {
  if (_crcTable) return _crcTable;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) >>> 0 : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  _crcTable = t;
  return t;
}

/**
 * Generate the per-org Teams app package. Returns a Buffer containing
 * a valid `.zip` with `manifest.json`, `color.png`, and `outline.png`.
 *
 * Async because JSZip's `generateAsync` builds the zip stream
 * progressively. Pure: no env reads, no DB writes — caller threads
 * env-derived `botId` in.
 */
export async function generateTeamsPackage(args: TeamsManifestArgs): Promise<GeneratedTeamsPackage> {
  assertSafeOrgId(args.orgId);
  const url = assertSafeBaseUrl(args.baseUrl);

  const origin = `${url.protocol}//${url.host}${url.pathname.replace(/\/$/, '')}`;
  // Bot ID falls back to a placeholder in dev/test — the IT admin gets a
  // visible "REPLACE_BEFORE_INSTALL" string they have to fix, which is
  // safer than silently emitting an env-empty manifest.
  const botId = args.botId && args.botId.length > 0 ? args.botId : 'REPLACE_BEFORE_INSTALL';

  const manifest: TeamsManifestObject = {
    $schema: TEAMS_SCHEMA_URL,
    manifestVersion: '1.16',
    version: '1.0.0',
    id: deterministicUuid(args.orgId),
    packageName: `systems.unicron.pathfinder.${args.orgId.toLowerCase()}`,
    developer: {
      name: 'Unicron Systems',
      websiteUrl: 'https://www.unicron.systems',
      privacyUrl: `${origin}/privacy`,
      termsOfUseUrl: `${origin}/terms`,
    },
    name: {
      short: `Pathfinder (${args.orgId})`.slice(0, 30),
      full: `Pathfinder for ${args.orgId}`,
    },
    description: {
      short: 'Lead intelligence for construction security',
      full:
        'Pathfinder surfaces high-priority leads, daily briefs, and rejected-pile ' +
        'context inside Microsoft Teams. @-mention the bot or DM it to query the ' +
        'agent; Adaptive Card buttons feed the ranker.',
    },
    icons: { outline: 'outline.png', color: 'color.png' },
    accentColor: '#0A0A0A',
    bots: [
      {
        botId,
        scopes: ['personal', 'team', 'groupChat'],
        isNotificationOnly: false,
        supportsFiles: false,
        commandLists: [
          {
            scopes: ['personal', 'team', 'groupChat'],
            commands: [...COMMAND_LIST],
          },
        ],
      },
    ],
    permissions: ['identity', 'messageTeamMembers'],
    validDomains: [url.host],
  };

  const colorPng = buildSolidPng(192, [10, 10, 10]); // PF_TINTS.ink
  const outlinePng = buildSolidPng(32, [255, 255, 255]); // outline placeholder

  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('color.png', colorPng);
  zip.file('outline.png', outlinePng);

  const body = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  return {
    filename: `pathfinder-teams-${args.orgId}.zip`,
    body,
    manifest,
  };
}
