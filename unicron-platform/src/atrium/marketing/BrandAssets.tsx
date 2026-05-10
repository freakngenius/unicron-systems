// BrandAssets.tsx — Sprint 6 Stream A
// Grid of brand asset files organized by folder.
// Loads from GET /api/atrium/brand-assets.
// Click opens/downloads via GET /api/atrium/brand-assets/file?path=...

import { useState, useEffect, useCallback } from 'react';

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
    ext === '.pdf' ? '#EF4444'
    : ext === '.md' ? '#3B82F6'
    : ext === '.html' ? '#F59E0B'
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
      className="group bg-[#141416] border border-[#1F1F23] rounded-xl overflow-hidden hover:border-[#FF6B2B]/40 transition-colors flex flex-col"
      title={asset.name}
    >
      {/* Thumbnail / icon */}
      <div className="h-28 bg-[#0E0E10] p-2 flex items-center justify-center relative overflow-hidden">
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
        <div className="mono text-[11px] text-[#E5E5E7] truncate font-medium leading-tight">
          {asset.name}
        </div>
        <div className="mono text-[9px] text-[rgba(229,229,231,0.35)] uppercase tracking-[0.08em]">
          {formatSize(asset.sizeBytes)}
        </div>
      </div>

      {/* Open hint on hover */}
      <div className="px-3 pb-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="mono text-[9px] text-[#FF6B2B] uppercase tracking-[0.1em]">
          Open ↗
        </div>
      </div>
    </a>
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
  const folders = ['All', ...Array.from(new Set(assets.map((a) => a.folder))).sort()];
  const filtered = activeFolder === 'All' ? assets : assets.filter((a) => a.folder === activeFolder);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-36 bg-[#141416] rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl px-5 py-4">
        <div className="mono text-[12px] text-[#EF4444]">{error}</div>
        <button
          onClick={() => void load()}
          className="mono text-[10px] uppercase tracking-[0.12em] mt-2 text-[rgba(229,229,231,0.5)] hover:text-[#E5E5E7] transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!mounted) {
    return (
      <div className="bg-[#141416] border border-[#1F1F23] rounded-xl px-6 py-8 text-center">
        <div className="mono text-[11px] uppercase tracking-[0.18em] text-[rgba(229,229,231,0.4)] mb-2">
          Brand directory not mounted
        </div>
        <div className="mono text-[12px] text-[rgba(229,229,231,0.3)] mb-3 max-w-sm mx-auto">
          {hint ?? 'Brand assets are not accessible on this server.'}
        </div>
        <div className="mono text-[10px] text-[rgba(229,229,231,0.2)]">
          Set <span className="text-[#FF6B2B]">BRAND_DIR</span> env var to the absolute path of the Brand/ directory.
        </div>
      </div>
    );
  }

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
              background: activeFolder === folder ? '#FF6B2B22' : '#1F1F23',
              color: activeFolder === folder ? '#FF6B2B' : 'rgba(229,229,231,0.45)',
            }}
          >
            {folder}
          </button>
        ))}
        <span className="ml-auto mono text-[10px] text-[rgba(229,229,231,0.3)] shrink-0">
          {filtered.length} file{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-[#141416] border border-[#1F1F23] rounded-xl px-5 py-10 text-center">
          <div className="mono text-[11px] text-[rgba(229,229,231,0.3)]">
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
    </div>
  );
}
