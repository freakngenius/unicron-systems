// BrandAssets.tsx — Sprint 6 Stream A
// Grid of brand asset files organized by folder.
// Loads from GET /api/atrium/brand-assets.
// Click opens/downloads via GET /api/atrium/brand-assets/file?path=...
//
// Atrium audit fix #23: upload form added so the gallery is bidirectional,
// not read-only. Uses POST /api/atrium/brand-assets (multipart/form-data).

import { useState, useEffect, useCallback, useRef } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BrandAsset {
  name: string;
  relativePath: string;
  extension: string;
  sizeBytes: number;
  folder: string;
  isImage: boolean;
}

interface BrandAssetsResponse {
  assets: BrandAsset[];
  brandDirMounted: boolean;
  brandDir?: string;
  hint?: string;
  error?: string;
}

interface UploadResponse {
  ok: boolean;
  path?: string;
  name?: string;
  size?: number;
  error?: string;
}

const ROOT_SENTINEL = '__root';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const EXT_ICON: Record<string, string> = {
  '.pdf':  'PDF',
  '.md':   'MD',
  '.html': 'HTML',
  '.txt':  'TXT',
  '.pptx': 'PPT',
  '.docx': 'DOC',
  '.csv':  'CSV',
  '.json': 'JSON',
  '.svg':  'SVG',
};

function FileIcon({ ext }: { ext: string }) {
  const label = EXT_ICON[ext] ?? (ext.slice(1).toUpperCase().slice(0, 4) || 'FILE');
  const color =
    ext === '.pdf' ? '#E14B4B'
    : ext === '.md' ? '#6081BE'
    : ext === '.html' ? '#C28A1F'
    : ext === '.svg' ? '#7C3AED'
    : '#6B7280';

  return (
    <div
      className="w-full h-full flex items-center justify-center rounded-lg"
      style={{ background: color + '18' }}
    >
      <span className="mono text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

// ── Asset card ────────────────────────────────────────────────────────────────

function AssetCard({ asset }: { asset: BrandAsset }) {
  const fileUrl = `/api/atrium/brand-assets/file?path=${encodeURIComponent(asset.relativePath)}`;
  const isImage = asset.isImage && (asset.extension !== '.svg'); // SVG can embed; treat svg as image too
  const isSvg = asset.extension === '.svg';

  return (
    <a
      href={fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group bg-bg-card border border-border-default rounded-xl overflow-hidden hover:border-accent/40 transition-colors flex flex-col"
      title={asset.name}
    >
      {/* Thumbnail / icon */}
      <div className="h-28 bg-bg-raised p-2 flex items-center justify-center relative overflow-hidden">
        {isImage || isSvg ? (
          <img
            src={fileUrl}
            alt={asset.name}
            className="max-h-full max-w-full object-contain rounded"
            loading="lazy"
            onError={(e) => {
              // On load error fall back to icon
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-16 h-16">
            <FileIcon ext={asset.extension} />
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="px-3 py-2.5 flex-1 flex flex-col gap-0.5">
        <div className="mono text-[11px] text-text-primary truncate font-medium leading-tight">
          {asset.name}
        </div>
        <div className="mono text-[9px] text-text-muted uppercase tracking-[0.08em]">
          {formatSize(asset.sizeBytes)}
        </div>
      </div>

      {/* Open hint on hover */}
      <div className="px-3 pb-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="mono text-[9px] text-accent-orange uppercase tracking-[0.1em]">
          Open ↗
        </div>
      </div>
    </a>
  );
}

// ── Upload modal ──────────────────────────────────────────────────────────────

interface UploadModalProps {
  file: File;
  folders: string[]; // existing folders (no 'All', no 'Root')
  defaultFolder: string;
  onCancel: () => void;
  onUploaded: () => void;
}

function UploadModal({
  file,
  folders,
  defaultFolder,
  onCancel,
  onUploaded,
}: UploadModalProps) {
  const [folder, setFolder] = useState<string>(defaultFolder);
  const [uploading, setUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const doUpload = useCallback(async () => {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      fd.append('folder', folder);
      const res = await fetch('/api/atrium/brand-assets', {
        method: 'POST',
        body: fd,
      });
      const json = (await res.json()) as UploadResponse;
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `Upload failed (HTTP ${res.status})`);
      }
      onUploaded();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [file, folder, onUploaded]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget && !uploading) onCancel();
      }}
    >
      <div className="bg-bg-card border border-border-default rounded-xl w-[420px] max-w-[92vw] p-5 shadow-xl">
        <div className="mono text-[11px] uppercase tracking-[0.16em] text-text-muted mb-3">
          Upload brand asset
        </div>

        <div className="mb-3">
          <div className="mono text-[9px] uppercase tracking-[0.12em] text-text-muted mb-1">
            File
          </div>
          <div
            className="bg-bg-raised border border-border-default rounded-lg px-3 py-2 mono text-[11px] text-text-primary truncate"
            title={file.name}
          >
            {file.name}
          </div>
          <div className="mono text-[9px] text-text-muted mt-1">
            {formatSize(file.size)}
          </div>
        </div>

        <div className="mb-4">
          <label
            htmlFor="brand-upload-folder"
            className="mono text-[9px] uppercase tracking-[0.12em] text-text-muted mb-1 block"
          >
            Folder
          </label>
          <select
            id="brand-upload-folder"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            disabled={uploading}
            className="w-full bg-bg-raised border border-border-default rounded-lg px-3 py-2 mono text-[11px] text-text-primary"
          >
            <option value={ROOT_SENTINEL}>(brand root)</option>
            {folders.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="bg-[#E14B4B]/10 border border-[#E14B4B]/30 rounded-lg px-3 py-2 mb-3">
            <div className="mono text-[10px] text-[#E14B4B]">{error}</div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={uploading}
            className="mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 rounded-lg text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void doUpload()}
            disabled={uploading}
            className="mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 rounded-lg disabled:opacity-50"
            style={{
              background: 'rgba(232,118,58,0.13)',
              color: 'var(--accent)',
            }}
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function BrandAssets() {
  const [assets, setAssets] = useState<BrandAsset[]>([]);
  const [mounted, setMounted] = useState(true);
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<string>('All');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/atrium/brand-assets');
      const json = (await res.json()) as BrandAssetsResponse;
      if (!res.ok) throw new Error(json.error ?? 'Failed to load brand assets');
      setAssets(json.assets ?? []);
      setMounted(json.brandDirMounted ?? false);
      setHint(json.hint ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Derive folders
  const folderSet = Array.from(new Set(assets.map((a) => a.folder))).sort();
  const folders = ['All', ...folderSet];
  // Folders eligible as upload targets (drop synthetic 'Root' bucket — root
  // is selectable via the __root sentinel in the modal).
  const uploadFolders = folderSet.filter((f) => f !== 'Root');
  const filtered = activeFolder === 'All' ? assets : assets.filter((a) => a.folder === activeFolder);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setPendingFile(f);
    // reset value so picking the same file twice still triggers onChange
    e.target.value = '';
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-36 bg-bg-card rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#E14B4B]/10 border border-[#E14B4B]/30 rounded-xl px-5 py-4">
        <div className="mono text-[12px] text-[#E14B4B]">{error}</div>
        <button
          onClick={() => void load()}
          className="mono text-[10px] uppercase tracking-[0.12em] mt-2 text-text-secondary hover:text-text-primary transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!mounted) {
    return (
      <div className="bg-bg-card border border-border-default rounded-xl px-6 py-8 text-center">
        <div className="mono text-[11px] uppercase tracking-[0.18em] text-text-muted mb-2">
          Brand directory not mounted
        </div>
        <div className="mono text-[12px] text-text-muted mb-3 max-w-sm mx-auto">
          {hint ?? 'Brand assets are not accessible on this server.'}
        </div>
        <div className="mono text-[10px] text-text-faint">
          Set <span className="text-accent-orange">BRAND_DIR</span> env var to the absolute path of the Brand/ directory.
        </div>
      </div>
    );
  }

  const defaultUploadFolder =
    activeFolder !== 'All' && activeFolder !== 'Root' && uploadFolders.includes(activeFolder)
      ? activeFolder
      : (uploadFolders[0] ?? ROOT_SENTINEL);

  return (
    <div>
      {/* Folder tabs */}
      <div className="flex items-center gap-1 mb-5 overflow-x-auto pb-1">
        {folders.map((folder) => (
          <button
            key={folder}
            onClick={() => setActiveFolder(folder)}
            className="mono text-[10px] uppercase tracking-[0.1em] px-3 py-1.5 rounded-lg shrink-0 transition-colors"
            style={{
              background: activeFolder === folder ? `rgba(232,118,58,0.13)` : 'var(--border-default)',
              color: activeFolder === folder ? 'var(--accent)' : 'var(--text-lo)',
            }}
          >
            {folder}
          </button>
        ))}
        <span className="ml-auto mono text-[10px] text-text-muted shrink-0">
          {filtered.length} file{filtered.length !== 1 ? 's' : ''}
        </span>
        <button
          type="button"
          onClick={handleUploadClick}
          className="mono text-[10px] uppercase tracking-[0.1em] px-3 py-1.5 rounded-lg shrink-0 ml-2 transition-colors"
          style={{
            background: 'rgba(232,118,58,0.13)',
            color: 'var(--accent)',
          }}
          title="Upload a new brand asset"
        >
          + Upload
        </button>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelected}
          className="hidden"
          aria-hidden="true"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-bg-card border border-border-default rounded-xl px-5 py-10 text-center">
          <div className="mono text-[11px] text-text-muted">
            No files in this folder.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filtered.map((asset) => (
            <AssetCard key={asset.relativePath} asset={asset} />
          ))}
        </div>
      )}

      {pendingFile && (
        <UploadModal
          file={pendingFile}
          folders={uploadFolders}
          defaultFolder={defaultUploadFolder}
          onCancel={() => setPendingFile(null)}
          onUploaded={() => {
            setPendingFile(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
