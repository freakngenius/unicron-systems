'use client';

// Dashboard — top-level client component. Mirrors the App component at the bottom of
// `pathfinder-prototype/project/Pathfinder Hi-Fi.html` (Mono / default theme only).
//
// Responsibilities:
//   - holds top-level UI state (selected branch, source filter, cross-poll toggle, open project,
//     panel-minimized flags, activity-rail open flag).
//   - projects branch / customer / project lat-lon to SVG-space via lonLatToSvg.
//   - renders the Map, all chrome panels, and Stream 4's liveness widgets.

import * as React from 'react';
import type { Branch, Customer, Project } from '@/lib/types';
import { Map as MapSurface } from './Map';
import { BranchMarker } from './markers/BranchMarker';
import { ProjectPin } from './markers/ProjectPin';
import { CustomerMarker } from './markers/CustomerMarker';
import { CoverageRadius } from './markers/CoverageRadius';
import { WarmPin } from './markers/WarmPin';
import { TopBar, type SourceKey } from './TopBar';
import { BranchDock, type BranchStats } from './BranchDock';
import { ProjectList } from './ProjectList';
import { ProjectModal } from './ProjectModal';
import { AnchoredBranchCard } from './AnchoredBranchCard';
import { MapLegend } from './MapLegend';
import { CoordsHUD } from './CoordsHUD';
import { CrossPollBanner } from './CrossPollBanner';
import { ActivityRail, AgentStatusRow, SonarPing, useNewPins } from './live';
import { ZoomControl, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from './ZoomControl';
import { lonLatToSvg, svgToPx } from './map-projection';

const HI_THRESHOLD = 80;
const HI = '#22d3ee';
const MAP_INK = '#e6e9ef';
const WARM = '#a3e635';
const WARM_DASH = 0.25;

const SOURCE_FILTER_TO_DB: Record<Exclude<SourceKey, 'all'>, string> = {
  usa: 'usaspending',
  sam: 'sam.gov',
  news: 'news',
  harris: 'harris',
};

export interface DashboardProps {
  initialBranches: Branch[];
  initialCustomers: Customer[];
  initialProjects: Project[];
}

interface ProjectWithSvg extends Project {
  /** SVG-space coordinates derived from lat/lon. Undefined if either is null. */
  svgX?: number;
  svgY?: number;
}

interface BranchWithSvg extends Branch {
  svgX: number;
  svgY: number;
}

interface CustomerWithSvg extends Customer {
  svgX: number;
  svgY: number;
}

export function Dashboard({ initialBranches, initialCustomers, initialProjects }: DashboardProps) {
  // ── Derived: project lat/lon → SVG-space (memoized) ─────────────────────────
  const branches = React.useMemo<BranchWithSvg[]>(
    () =>
      initialBranches.map((b) => {
        const { x, y } = lonLatToSvg(b.lon, b.lat);
        return { ...b, svgX: x, svgY: y };
      }),
    [initialBranches],
  );

  const customers = React.useMemo<CustomerWithSvg[]>(
    () =>
      initialCustomers.map((c) => {
        const { x, y } = lonLatToSvg(c.lon, c.lat);
        return { ...c, svgX: x, svgY: y };
      }),
    [initialCustomers],
  );

  const projects = React.useMemo<ProjectWithSvg[]>(
    () =>
      initialProjects.map((p) => {
        if (p.lat == null || p.lon == null) return { ...p };
        const { x, y } = lonLatToSvg(p.lon, p.lat);
        return { ...p, svgX: x, svgY: y };
      }),
    [initialProjects],
  );

  // ── State ──────────────────────────────────────────────────────────────────
  const defaultBranch = branches[0]?.id ?? '';
  const [selectedBranchId, setSelectedBranchId] = React.useState<string>(defaultBranch);
  const [source, setSource] = React.useState<SourceKey>('all');
  const [crossPoll, setCrossPoll] = React.useState(false);
  const [openProjectId, setOpenProjectId] = React.useState<string | null>(null);
  const [branchMin, setBranchMin] = React.useState(false);
  const [listMin, setListMin] = React.useState(false);
  const [activityOpen, setActivityOpen] = React.useState(false);
  const [zoom, setZoom] = React.useState(1);

  const clampZoom = React.useCallback(
    (next: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(next * 10) / 10)),
    [],
  );
  const zoomIn = React.useCallback(() => setZoom((z) => clampZoom(z + ZOOM_STEP)), [clampZoom]);
  const zoomOut = React.useCallback(() => setZoom((z) => clampZoom(z - ZOOM_STEP)), [clampZoom]);

  // ── Container size measurement (drives px-space conversions) ───────────────
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [mapDims, setMapDims] = React.useState({ w: 1200, h: 800 });

  React.useEffect(() => {
    const update = () => {
      if (!containerRef.current) return;
      const r = containerRef.current.getBoundingClientRect();
      setMapDims({ w: r.width, h: r.height });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // ── Keyboard: + / − zoom the map only (no UI scaling) ──────────────────────
  React.useEffect(() => {
    const isTextField = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTextField(e.target)) return;
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomIn();
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomOut();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomIn, zoomOut]);

  // ── Derived: per-branch stats for the BranchDock ───────────────────────────
  const branchStats = React.useMemo<Record<string, BranchStats>>(() => {
    const m: Record<string, BranchStats> = {};
    for (const b of branches) m[b.id] = { count: 0, hi: 0 };
    for (const p of projects) {
      const bid = p.nearest_branch_id;
      if (!bid || !m[bid]) continue;
      m[bid].count += 1;
      if ((p.score ?? 0) >= HI_THRESHOLD) m[bid].hi += 1;
    }
    return m;
  }, [branches, projects]);

  // ── Derived: filtered project list for the right rail ──────────────────────
  const filteredProjects = React.useMemo<ProjectWithSvg[]>(() => {
    if (crossPoll) {
      return projects
        .filter((p) => !!p.warm_for_customer_id)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    }
    let r = projects.filter((p) => p.nearest_branch_id === selectedBranchId);
    if (source !== 'all') {
      const db = SOURCE_FILTER_TO_DB[source];
      r = r.filter((p) => p.source === db);
    }
    return r.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }, [projects, selectedBranchId, source, crossPoll]);

  const totalForBranch = projects.filter((p) => p.nearest_branch_id === selectedBranchId).length;

  // ── Derived: warm-intro lines (customer → project) when cross-poll on ──────
  const warmLines = React.useMemo(() => {
    const byId = new Map(customers.map((c) => [c.id, c]));
    return projects
      .filter((p) => !!p.warm_for_customer_id && p.svgX != null && p.svgY != null)
      .map((p) => {
        const c = byId.get(p.warm_for_customer_id as string);
        if (!c) return null;
        return { customer: c, project: p as ProjectWithSvg & { svgX: number; svgY: number } };
      })
      .filter(Boolean) as { customer: CustomerWithSvg; project: ProjectWithSvg & { svgX: number; svgY: number } }[];
  }, [customers, projects]);

  const newPins = useNewPins();
  const selectedBranch = branches.find((b) => b.id === selectedBranchId) ?? null;
  const openProject = openProjectId
    ? projects.find((p) => p.id === openProjectId) ?? null
    : null;
  const openProjectBranch = openProject
    ? branches.find((b) => b.id === openProject.nearest_branch_id) ?? null
    : null;

  // Anchored card pixel position
  const anchoredPx = selectedBranch
    ? svgToPx(selectedBranch.svgX, selectedBranch.svgY, mapDims.w, mapDims.h)
    : null;

  const customersForBranch = selectedBranch
    ? customers.filter((c) => c.served_by_branch_id === selectedBranch.id).length
    : 0;

  return (
    <div
      ref={containerRef}
      style={{ position: 'fixed', inset: 0, background: '#0e1116' }}
      className="pf-root"
    >
      <MapSurface
        width={mapDims.w}
        height={mapDims.h}
        zoom={zoom}
        centerX={selectedBranch?.svgX}
        centerY={selectedBranch?.svgY}
      >
        {/* ─── Default (non-cross-poll) layer ─── */}
        <g opacity={crossPoll ? WARM_DASH : 1}>
          {!crossPoll && selectedBranch && (
            <CoverageRadius x={selectedBranch.svgX} y={selectedBranch.svgY} />
          )}
          {projects.map((p) =>
            p.svgX != null && p.svgY != null ? (
              <ProjectPin
                key={p.id}
                x={p.svgX}
                y={p.svgY}
                hi={(p.score ?? 0) >= HI_THRESHOLD}
                onClick={() => setOpenProjectId(p.id)}
              />
            ) : null,
          )}
          {branches.map((b) => (
            <BranchMarker
              key={b.id}
              x={b.svgX}
              y={b.svgY}
              code={b.code}
              selected={!crossPoll && b.id === selectedBranchId}
              onClick={() => setSelectedBranchId(b.id)}
            />
          ))}
          {/* Sonar pings on freshly-ingested pins (Stream 4 stub returns null) */}
          {[...newPins].map((id) => {
            const p = projects.find((pp) => pp.id === id);
            if (!p || p.svgX == null || p.svgY == null) return null;
            const isHi = (p.score ?? 0) >= HI_THRESHOLD;
            return (
              <SonarPing key={`sp-${id}`} x={p.svgX} y={p.svgY} color={isHi ? HI : MAP_INK} />
            );
          })}
        </g>

        {/* ─── Cross-poll overlay layer ─── */}
        {crossPoll && (
          <g>
            {customers.map((c) => (
              <circle
                key={`halo-${c.id}`}
                cx={c.svgX}
                cy={c.svgY}
                r="14"
                fill="none"
                stroke={WARM}
                strokeWidth="0.5"
                strokeDasharray="1,2"
                opacity="0.6"
              />
            ))}
            {warmLines.map((l, i) => (
              <line
                key={`line-${i}`}
                x1={l.customer.svgX}
                y1={l.customer.svgY}
                x2={l.project.svgX}
                y2={l.project.svgY}
                stroke={WARM}
                strokeWidth="0.8"
                strokeDasharray="3,3"
              />
            ))}
            {customers.map((c) => (
              <CustomerMarker key={`cm-${c.id}`} x={c.svgX} y={c.svgY} warm />
            ))}
            {warmLines.map((l, i) => (
              <WarmPin
                key={`wp-${i}`}
                x={l.project.svgX}
                y={l.project.svgY}
                label={`WI-${i + 1}`}
                onClick={() => setOpenProjectId(l.project.id)}
              />
            ))}
            {branches.map((b) => (
              <g key={`bm-${b.id}`} opacity="0.6">
                <BranchMarker
                  x={b.svgX}
                  y={b.svgY}
                  code={b.code}
                  onClick={() => setSelectedBranchId(b.id)}
                />
              </g>
            ))}
          </g>
        )}
      </MapSurface>

      <TopBar
        source={source}
        setSource={setSource}
        crossPoll={crossPoll}
        setCrossPoll={setCrossPoll}
      />
      <AgentStatusRow />
      <BranchDock
        branches={branches}
        selectedId={selectedBranchId}
        setSelected={setSelectedBranchId}
        minimized={branchMin}
        setMinimized={setBranchMin}
        stats={branchStats}
      />
      <ProjectList
        branch={selectedBranch}
        projects={filteredProjects}
        totalCount={crossPoll ? warmLines.length : totalForBranch}
        onOpen={(p) => setOpenProjectId(p.id)}
        crossPoll={crossPoll}
        minimized={listMin}
        setMinimized={setListMin}
      />

      {!crossPoll && selectedBranch && anchoredPx && (
        <AnchoredBranchCard
          branch={selectedBranch}
          anchorPx={anchoredPx}
          inRangeCount={branchStats[selectedBranch.id]?.count ?? 0}
          hiCount={branchStats[selectedBranch.id]?.hi ?? 0}
          customerCount={customersForBranch}
        />
      )}
      {crossPoll && <CrossPollBanner count={warmLines.length} />}
      <MapLegend crossPoll={crossPoll} />
      <ZoomControl
        zoom={zoom}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        left={crossPoll ? 720 : 580}
      />
      <CoordsHUD branch={selectedBranch} />

      {openProject && (
        <ProjectModal
          project={openProject}
          branch={openProjectBranch}
          onClose={() => setOpenProjectId(null)}
        />
      )}

      <ActivityRail open={activityOpen} setOpen={setActivityOpen} />
    </div>
  );
}
