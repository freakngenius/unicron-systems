// GET  /api/atrium/brand-assets — recursively lists files from the Brand/ directory.
// POST /api/atrium/brand-assets — multipart upload of a single brand asset.
//
// Returns (GET): assets[]= { path, name, extension, size, folder, isImage }.
//
// Sprint 6 Stream A. Upload (POST) added for Atrium audit fix #23
// ("Brand Assets upload — add an upload form to BrandAssets.tsx so the gallery
//  is bidirectional, not read-only").
//
// POST contract:
//   Content-Type: multipart/form-data
//   Fields:
//     file:    Blob (required, ≤ 25 MB)
//     folder:  existing folder name OR "__root" (required)
//   Filename rules:
//     - allowlist regex: /^[A-Za-z0-9._ -]+$/
//     - extension in: jpg jpeg png gif svg webp pdf mp4 mov ai psd sketch fig
//     - no path traversal chars (/, \, ..)
//   Returns 200 { ok:true, path, name, size } on success,
//   409 if file exists, 400 / 413 on validation errors.
//   On success a row is written to nervous_system.audit_log
//   (action='brand_assets_upload').

import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BrandAsset {
  name: string;
  relativePath: string;
  extension: string;
  sizeBytes: number;
  folder: string;
  isImage: boolean;
}

interface UploadOk {
  ok: true;
  path: string;
  name: string;
  size: number;
}

interface UploadErr {
  ok: false;
  error: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif', '.ico', '.avif']);
const UPLOAD_ALLOWED_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp',
  '.pdf', '.mp4', '.mov', '.ai', '.psd', '.sketch', '.fig',
]);
const FILENAME_RE = /^[A-Za-z0-9._ -]+$/;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB
const ROOT_SENTINEL = '__root';

// ── Brand root resolution ─────────────────────────────────────────────────────

function resolveBrandDir(): string | null {
  if (process.env.BRAND_DIR) return process.env.BRAND_DIR;
  const candidates = [
    '/Users/keka/Dropbox/Projects/Unicron Systems/Brand',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

// ── Recursive walker ──────────────────────────────────────────────────────────

function walkBrand(dir: string, base: string, results: BrandAsset[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue; // skip .DS_Store etc.
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkBrand(full, base, results);
    } else if (entry.isFile()) {
      let stat: fs.Stats;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      const rel = path.relative(base, full);
      const ext = path.extname(entry.name).toLowerCase();
      const parts = rel.split(path.sep);
      const folder = parts.length > 1 ? parts[0] : 'Root';
      results.push({
        name: entry.name,
        relativePath: rel,
        extension: ext,
        sizeBytes: stat.size,
        folder,
        isImage: IMAGE_EXTS.has(ext),
      });
    }
  }
}

// ── Audit log helper ──────────────────────────────────────────────────────────

function getServiceClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function writeAuditLog(payload: {
  filename: string;
  folder: string;
  size_bytes: number;
}): Promise<void> {
  const sb = getServiceClient();
  if (!sb) return;
  try {
    await sb.from('audit_log').insert({
      table_name: 'brand_assets',
      action: 'brand_assets_upload',
      actor_id: null,
      payload: {
        ...payload,
        source: 'brand_assets_upload',
      },
    });
  } catch {
    // Non-fatal: audit failure must not undo a successful write.
  }
}

// ── Folder allowlist ──────────────────────────────────────────────────────────

function listExistingFolders(brandDir: string): Set<string> {
  const assets: BrandAsset[] = [];
  walkBrand(brandDir, brandDir, assets);
  const folders = new Set<string>();
  for (const a of assets) {
    if (a.folder !== 'Root') folders.add(a.folder);
  }
  return folders;
}

// ── POST handler ──────────────────────────────────────────────────────────────

async function handlePost(req: VercelRequest, res: VercelResponse): Promise<void> {
  const brandDir = resolveBrandDir();
  if (!brandDir) {
    const body: UploadErr = { ok: false, error: 'Brand directory not mounted on this server' };
    res.status(503).json(body);
    return;
  }

  // Parse multipart via the Web Request shim. Vercel Node 18+ exposes
  // formData() on the Request adapter.
  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    const body: UploadErr = { ok: false, error: 'Expected multipart/form-data' };
    res.status(400).json(body);
    return;
  }

  // Build a Web Request from the raw Node request body so we can use
  // the standard FormData parser (no extra npm deps).
  let form: FormData;
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req as unknown as AsyncIterable<Buffer | string>) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const raw = Buffer.concat(chunks);
    if (raw.byteLength > MAX_UPLOAD_BYTES + 64 * 1024) {
      const body: UploadErr = { ok: false, error: 'Payload exceeds 25 MB cap' };
      res.status(413).json(body);
      return;
    }
    const webReq = new Request('http://localhost/upload', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: new Uint8Array(raw),
    });
    form = await webReq.formData();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid multipart body';
    const body: UploadErr = { ok: false, error: msg };
    res.status(400).json(body);
    return;
  }

  const fileField = form.get('file');
  const folderField = form.get('folder');

  if (!(fileField instanceof Blob)) {
    const body: UploadErr = { ok: false, error: 'Missing required field: file (Blob)' };
    res.status(400).json(body);
    return;
  }
  if (typeof folderField !== 'string' || folderField.length === 0) {
    const body: UploadErr = { ok: false, error: 'Missing required field: folder' };
    res.status(400).json(body);
    return;
  }

  // Validate size
  if (fileField.size > MAX_UPLOAD_BYTES) {
    const body: UploadErr = { ok: false, error: 'File exceeds 25 MB cap' };
    res.status(413).json(body);
    return;
  }
  if (fileField.size === 0) {
    const body: UploadErr = { ok: false, error: 'File is empty' };
    res.status(400).json(body);
    return;
  }

  // Resolve filename. Blob may or may not be a File (with .name).
  const rawName: string | undefined =
    typeof (fileField as File).name === 'string' ? (fileField as File).name : undefined;
  if (!rawName) {
    const body: UploadErr = { ok: false, error: 'File field has no filename' };
    res.status(400).json(body);
    return;
  }

  const filename = rawName.trim();
  if (
    filename.length === 0 ||
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes('..') ||
    !FILENAME_RE.test(filename)
  ) {
    const body: UploadErr = {
      ok: false,
      error: 'Filename must match [A-Za-z0-9._ -]+ with no path traversal',
    };
    res.status(400).json(body);
    return;
  }

  const ext = path.extname(filename).toLowerCase();
  if (!UPLOAD_ALLOWED_EXTS.has(ext)) {
    const body: UploadErr = {
      ok: false,
      error: `Extension ${ext || '(none)'} not in allowlist`,
    };
    res.status(400).json(body);
    return;
  }

  // Validate folder against existing folders (fresh walk).
  const folder = folderField.trim();
  let targetDir: string;
  if (folder === ROOT_SENTINEL) {
    targetDir = brandDir;
  } else {
    const existing = listExistingFolders(brandDir);
    if (!existing.has(folder)) {
      const body: UploadErr = {
        ok: false,
        error: 'Folder not in allowlist (must be an existing brand folder or __root)',
      };
      res.status(400).json(body);
      return;
    }
    targetDir = path.join(brandDir, folder);
  }

  // Defensive path resolution — ensure target stays inside brandDir.
  const targetPath = path.resolve(targetDir, filename);
  const brandResolved = path.resolve(brandDir);
  if (
    !targetPath.startsWith(brandResolved + path.sep) &&
    targetPath !== brandResolved
  ) {
    const body: UploadErr = { ok: false, error: 'Path traversal not allowed' };
    res.status(403).json(body);
    return;
  }

  // Reject overwrite
  if (fs.existsSync(targetPath)) {
    const body: UploadErr = { ok: false, error: 'A file with that name already exists' };
    res.status(409).json(body);
    return;
  }

  // Write
  try {
    const buf = Buffer.from(await fileField.arrayBuffer());
    await fsp.writeFile(targetPath, buf);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Write failed';
    const body: UploadErr = { ok: false, error: msg };
    res.status(500).json(body);
    return;
  }

  const relativePath = path.relative(brandDir, targetPath);

  // Audit (non-fatal)
  await writeAuditLog({
    filename,
    folder,
    size_bytes: fileField.size,
  });

  const body: UploadOk = {
    ok: true,
    path: relativePath,
    name: filename,
    size: fileField.size,
  };
  res.status(200).json(body);
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method === 'POST') {
    await handlePost(req, res);
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const brandDir = resolveBrandDir();
  if (!brandDir) {
    // Bug-fix (2026-05-22): Brand/ lives outside the unicron-knowledge git
    // repo (Dropbox-only), so there's no GitHub fallback like Content has.
    // On Vercel, BRAND_DIR will never be set and this endpoint returns empty.
    // The proper fix is to migrate Brand/ to Supabase Storage (or a similar
    // remote bucket) so both reads and writes work across deploys. Until that
    // ships, this hint surfaces the real situation rather than the misleading
    // "set BRAND_DIR" instruction that won't help on Vercel.
    res.status(200).json({
      assets: [],
      brandDirMounted: false,
      hint:
        'Brand Assets is currently filesystem-only. Locally, set BRAND_DIR to ' +
        'the absolute path of your Brand/ directory. On Vercel, the surface ' +
        'is empty until Brand/ is migrated to Supabase Storage (tracked in ' +
        'the Atrium audit fix closeout punch list).',
      migration_target: 'supabase-storage://brand',
    });
    return;
  }

  const assets: BrandAsset[] = [];
  walkBrand(brandDir, brandDir, assets);

  // Sort: folder asc, then name asc
  assets.sort((a, b) =>
    a.folder !== b.folder
      ? a.folder.localeCompare(b.folder)
      : a.name.localeCompare(b.name),
  );

  res.status(200).json({ assets, brandDirMounted: true, brandDir });
}

// Note: default Vercel body parser is fine here because we manually
// read the raw stream for multipart. If Vercel pre-parses JSON bodies,
// it will skip multipart/form-data and leave the stream intact.
export const config = {
  api: {
    bodyParser: false,
  },
};
