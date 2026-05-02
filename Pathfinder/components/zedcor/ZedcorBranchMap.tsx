'use client';

// Z-C #15 — Zedcor branch radius map.
//
// Renders all active zedcor_branches as pins with a 200mi (radius_miles)
// circle drawn in geographic coordinates (real great-circle radius — uses
// google.maps.Circle), and projects from the last 30 days color-coded by
// `nearest_zedcor_branch_id`. The three target branches for the Tuesday
// demo (Nashville, Pennsylvania=Pittsburgh, Los Angeles) light brighter.

import * as React from 'react';
import { APIProvider, Map as GoogleMap, useMap, Marker } from '@vis.gl/react-google-maps';
import { PATHFINDER_DARK_STYLE } from '@/lib/map-style';

const MAP_BG = '#0e1116';
const TARGET_COLOR = '#FFB454'; // amber — same as TIER_COLORS.amber
const TARGET_FILL = 'rgba(255, 180, 84, 0.10)';
const TARGET_STROKE = 'rgba(255, 180, 84, 0.55)';
const REGULAR_COLOR = '#5B7FFF'; // cobalt
const REGULAR_FILL = 'rgba(91, 127, 255, 0.05)';
const REGULAR_STROKE = 'rgba(91, 127, 255, 0.35)';
const PROJECT_DEFAULT = '#9AA3B2';
const PROJECT_HI = '#3DDC97';

const DEFAULT_CENTER = { lat: 39.5, lng: -98.5 };
const DEFAULT_ZOOM = 4.2;

const METERS_PER_MILE = 1609.344;

export interface ZedcorMapBranch {
  id: string;
  branch_name: string;
  state: string;
  country: string;
  city: string | null;
  lat: number;
  lon: number;
  radius_miles: number;
  is_target: boolean;
}

export interface ZedcorMapProject {
  id: string;
  title: string;
  score: number | null;
  lat: number;
  lon: number;
  nearest_zedcor_branch_id: string | null;
  distance_miles: number | null;
}

export interface ZedcorBranchMapProps {
  branches: ZedcorMapBranch[];
  projects: ZedcorMapProject[];
  loadError: string | null;
}

export function ZedcorBranchMap({ branches, projects, loadError }: ZedcorBranchMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Hooks must run unconditionally (rules-of-hooks); the early returns
  // below short-circuit the render after this block.
  const projectsByBranch = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const p of projects) {
      if (!p.nearest_zedcor_branch_id) continue;
      m.set(p.nearest_zedcor_branch_id, (m.get(p.nearest_zedcor_branch_id) ?? 0) + 1);
    }
    return m;
  }, [projects]);
  const targetCount = branches.filter((b) => b.is_target).length;

  if (loadError) {
    return <FullScreenMessage>Failed to load Zedcor branches: {loadError}</FullScreenMessage>;
  }
  if (!apiKey) {
    return (
      <FullScreenMessage>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing — set it in .env.local</FullScreenMessage>
    );
  }
  if (branches.length === 0) {
    return <FullScreenMessage>No active Zedcor branches loaded.</FullScreenMessage>;
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: MAP_BG }}>
      <APIProvider apiKey={apiKey} libraries={['marker', 'maps']}>
        <GoogleMap
          defaultCenter={DEFAULT_CENTER}
          defaultZoom={DEFAULT_ZOOM}
          minZoom={3}
          maxZoom={16}
          gestureHandling="greedy"
          disableDefaultUI={true}
          clickableIcons={false}
          styles={PATHFINDER_DARK_STYLE as unknown as google.maps.MapTypeStyle[]}
          style={{ width: '100%', height: '100%' }}
        >
          <BranchCircles branches={branches} />
          {branches.map((b) => (
            <BranchPin key={`b-${b.id}`} branch={b} />
          ))}
          {projects.map((p) => (
            <ProjectPin key={`p-${p.id}`} project={p} branches={branches} />
          ))}
        </GoogleMap>

        <Header
          branchCount={branches.length}
          targetCount={targetCount}
          projectCount={projects.length}
          projectsByBranch={projectsByBranch}
          branches={branches}
        />
      </APIProvider>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Geographic circles — google.maps.Circle, real-world radius in meters.
// Lifecycle managed via useEffect (no React component for Circle in
// @vis.gl/react-google-maps; we hook into the map instance directly).
// ────────────────────────────────────────────────────────────────────────

function BranchCircles({ branches }: { branches: ZedcorMapBranch[] }) {
  const map = useMap();
  React.useEffect(() => {
    if (!map || typeof google === 'undefined') return;
    const circles: google.maps.Circle[] = [];
    for (const b of branches) {
      const c = new google.maps.Circle({
        center: { lat: b.lat, lng: b.lon },
        radius: b.radius_miles * METERS_PER_MILE,
        map,
        strokeColor: b.is_target ? TARGET_STROKE : REGULAR_STROKE,
        strokeOpacity: 1,
        strokeWeight: b.is_target ? 1.5 : 1,
        fillColor: b.is_target ? TARGET_FILL : REGULAR_FILL,
        fillOpacity: 1,
        clickable: false,
        zIndex: b.is_target ? 2 : 1,
      });
      circles.push(c);
    }
    return () => {
      for (const c of circles) c.setMap(null);
    };
  }, [map, branches]);
  return null;
}

// ────────────────────────────────────────────────────────────────────────
// Branch pin — square marker in branch tier color, with branch-name label.
// ────────────────────────────────────────────────────────────────────────

function BranchPin({ branch }: { branch: ZedcorMapBranch }) {
  const icon = React.useMemo<google.maps.Icon | null>(() => {
    if (typeof google === 'undefined') return null;
    const color = branch.is_target ? TARGET_COLOR : REGULAR_COLOR;
    const ringStroke = branch.is_target
      ? `<rect x="0" y="0" width="20" height="20" fill="none" stroke="${color}" stroke-width="2" opacity="0.85"/>`
      : '';
    const labelChars = branch.branch_name.length;
    const w = 24 + labelChars * 7;
    const h = 20;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
        ${ringStroke}
        <rect x="4" y="4" width="12" height="12" fill="${color}" stroke="${MAP_BG}" stroke-width="2"/>
        <text x="24" y="14" font-family="ui-monospace, 'JetBrains Mono', monospace" font-size="11" font-weight="${branch.is_target ? 800 : 600}" fill="#e6e9ef" letter-spacing="0.04em">${escapeXml(branch.branch_name)}</text>
      </svg>`;
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new google.maps.Size(w, h),
      anchor: new google.maps.Point(10, 10),
    };
  }, [branch]);
  if (!icon) return null;
  return (
    <Marker
      position={{ lat: branch.lat, lng: branch.lon }}
      icon={icon}
      title={`${branch.branch_name} · ${branch.state} · ${branch.radius_miles}mi radius`}
      zIndex={branch.is_target ? 1000 : 100}
    />
  );
}

// ────────────────────────────────────────────────────────────────────────
// Project pin — small color-coded dot. Color tracks the matched branch's
// tier color (target=amber, regular=cobalt) so the eye groups projects to
// their branch. Hi-priority projects (score >= 80) get a brighter green
// highlight.
// ────────────────────────────────────────────────────────────────────────

function ProjectPin({ project, branches }: { project: ZedcorMapProject; branches: ZedcorMapBranch[] }) {
  const branch = React.useMemo(
    () => branches.find((b) => b.id === project.nearest_zedcor_branch_id) ?? null,
    [branches, project.nearest_zedcor_branch_id],
  );
  const isHi = (project.score ?? 0) >= 80;
  const color = isHi ? PROJECT_HI : branch?.is_target ? TARGET_COLOR : branch ? REGULAR_COLOR : PROJECT_DEFAULT;
  const icon = React.useMemo<google.maps.Symbol | null>(() => {
    if (typeof google === 'undefined') return null;
    return {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: color,
      fillOpacity: isHi ? 0.95 : 0.65,
      strokeColor: color,
      strokeWeight: isHi ? 2 : 1,
      strokeOpacity: 1,
      scale: isHi ? 6 : 4,
    };
  }, [color, isHi]);
  if (!icon) return null;
  return (
    <Marker
      position={{ lat: project.lat, lng: project.lon }}
      icon={icon}
      title={`${project.title}${project.score != null ? ` · score ${project.score}` : ''}${project.distance_miles != null ? ` · ${project.distance_miles.toFixed(0)}mi from ${branch?.branch_name ?? 'branch'}` : ''}`}
      zIndex={isHi ? 50 : 10}
    />
  );
}

// ────────────────────────────────────────────────────────────────────────
// Header — top-left chrome panel with branch + project counts.
// ────────────────────────────────────────────────────────────────────────

function Header({
  branchCount,
  targetCount,
  projectCount,
  projectsByBranch,
  branches,
}: {
  branchCount: number;
  targetCount: number;
  projectCount: number;
  projectsByBranch: Map<string, number>;
  branches: ZedcorMapBranch[];
}) {
  const targetBranches = branches.filter((b) => b.is_target);
  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        zIndex: 50,
        background: 'rgba(14, 17, 22, 0.85)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(91, 127, 255, 0.25)',
        borderRadius: 6,
        padding: '12px 16px',
        color: '#e6e9ef',
        font: '500 12px var(--font-jetbrains-mono), ui-monospace, monospace',
        minWidth: 280,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, letterSpacing: '0.06em' }}>
        ZEDCOR · BRANCH RADIUS
      </div>
      <div style={{ opacity: 0.75, marginBottom: 10 }}>
        {branchCount} branches · {targetCount} target · {projectCount} projects (30d)
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {targetBranches.map((b) => (
          <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: TARGET_COLOR, fontWeight: 700 }}>
              ▣ {b.branch_name === 'Pennsylvania' ? 'Pittsburgh, PA' : `${b.branch_name}, ${b.state}`}
            </span>
            <span style={{ opacity: 0.85 }}>{projectsByBranch.get(b.id) ?? 0} leads</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)', opacity: 0.55, fontSize: 11 }}>
        <span style={{ color: TARGET_COLOR }}>amber</span> = target ·{' '}
        <span style={{ color: REGULAR_COLOR }}>cobalt</span> = other ·{' '}
        <span style={{ color: PROJECT_HI }}>green</span> = hi-priority lead
      </div>
    </div>
  );
}

function FullScreenMessage({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: MAP_BG,
        color: '#e6e9ef',
        font: '500 14px var(--font-jetbrains-mono), ui-monospace, monospace',
        padding: 24,
        textAlign: 'center',
      }}
    >
      {children}
    </div>
  );
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '"':
        return '&quot;';
      case "'":
        return '&apos;';
      default:
        return c;
    }
  });
}
