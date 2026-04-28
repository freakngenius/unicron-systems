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
import {
  ActivityRail,
  AgentStatusRow,
  SonarPing,
  useHeaderHeight,
  useNewPins,
} from './live';
import { ZoomControl, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from './ZoomControl';
import { lonLatToSvg, svgToPx, SVG_VIEWBOX } from './map-projection';

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
  // null = "See All" (zoom-out, no specific branch focus). Default to See All on load
  // so the viewer first sees the full footprint before drilling into a branch.
  const [selectedBranchId, setSelectedBranchId] = React.useState<string | null>(null);
  const [source, setSource] = React.useState<SourceKey>('all');
  const [crossPoll, setCrossPoll] = React.useState(false);
  const [openProjectId, setOpenProjectId] = React.useState<string | null>(null);
  const [branchMin, setBranchMin] = React.useState(false);
  const [listMin, setListMin] = React.useState(false);
  const [activityOpen, setActivityOpen] = React.useState(false);
  const [zoom, setZoom] = React.useState(1);
  const [refreshing, setRefreshing] = React.useState(false);

  // Pan state — offset in SVG units relative to the auto-center (selected branch
  // or viewBox midpoint). Reset whenever the user picks a new branch or "See All".
  const [panX, setPanX] = React.useState(0);
  const [panY, setPanY] = React.useState(0);
  const [spaceHeld, setSpaceHeld] = React.useState(false);
  const [panning, setPanning] = React.useState(false);
  const panDragRef = React.useRef<null | {
    startClient: { x: number; y: number };
    startPan: { x: number; y: number };
    /** SVG-units-per-pixel at drag start (frozen so the gesture feels stable). */
    invScale: number;
  }>(null);

  const handleRefresh = React.useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const res = await fetch('/pathfinder/api/refresh', { method: 'POST' });
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.error('refresh failed', res.status, await res.text());
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('refresh error', err);
    } finally {
      // small floor so the button can't be hammered; the realtime cascade
      // takes ~3s to fully play out.
      setTimeout(() => setRefreshing(false), 1500);
    }
  }, [refreshing]);

  const clampZoom = React.useCallback(
    (next: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(next * 10) / 10)),
    [],
  );
  const zoomIn = React.useCallback(() => setZoom((z) => clampZoom(z + ZOOM_STEP)), [clampZoom]);
  const zoomOut = React.useCallback(() => setZoom((z) => clampZoom(z - ZOOM_STEP)), [clampZoom]);

  // Branch select with auto-zoom. Null → See All (z=1). Id → tight focus on that branch.
  // The auto-zoom level (3.0) is calibrated so the 300mi coverage circle (75 SVG units
  // radius / 150 diameter) fills roughly half the viewport — emphasizes the focus
  // without losing context. Manual +/- still works after to override.
  // Selecting a branch also resets any space-held pan so the new focus is centered.
  const BRANCH_FOCUS_ZOOM = 3.0;
  const handleSelectBranch = React.useCallback((id: string | null) => {
    setSelectedBranchId(id);
    setZoom(id === null ? 1 : BRANCH_FOCUS_ZOOM);
    setPanX(0);
    setPanY(0);
  }, []);

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

  // ── Keyboard: + / − zoom the map only · Space toggles pan-mode ─────────────
  React.useEffect(() => {
    const isTextField = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTextField(e.target)) return;
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomIn();
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomOut();
      } else if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        setSpaceHeld(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpaceHeld(false);
        setPanning(false);
        panDragRef.current = null;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [zoomIn, zoomOut]);

  // ── Mouse drag: while spaceHeld, drag the map; cursor flips to grab/grabbing ──
  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = panDragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startClient.x;
      const dy = e.clientY - drag.startClient.y;
      // Drag right (dx > 0) → map content moves right → viewBox shifts left → panX decreases
      setPanX(drag.startPan.x - dx * drag.invScale);
      setPanY(drag.startPan.y - dy * drag.invScale);
    };
    const onUp = () => {
      panDragRef.current = null;
      setPanning(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const handleMapMouseDown = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!spaceHeld) return;
      // Only respond to primary (left) button.
      if (e.button !== 0) return;
      e.preventDefault();
      const w = SVG_VIEWBOX.width / Math.max(1, zoom);
      const h = SVG_VIEWBOX.height / Math.max(1, zoom);
      // Pixel-to-SVG conversion at the current zoom level. preserveAspectRatio="slice"
      // uses the larger of the two scales so the SVG covers the container.
      const scale = Math.max(mapDims.w / w, mapDims.h / h);
      panDragRef.current = {
        startClient: { x: e.clientX, y: e.clientY },
        startPan: { x: panX, y: panY },
        invScale: 1 / scale,
      };
      setPanning(true);
    },
    [spaceHeld, zoom, mapDims.w, mapDims.h, panX, panY],
  );

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
    // selectedBranchId === null is "See All" — show every ranked project, top-scored first.
    let r = selectedBranchId
      ? projects.filter((p) => p.nearest_branch_id === selectedBranchId)
      : projects.slice();
    if (source !== 'all') {
      const db = SOURCE_FILTER_TO_DB[source];
      r = r.filter((p) => p.source === db);
    }
    return r.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }, [projects, selectedBranchId, source, crossPoll]);

  const totalForBranch = selectedBranchId
    ? projects.filter((p) => p.nearest_branch_id === selectedBranchId).length
    : projects.length;

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
  const headerH = useHeaderHeight();
  const selectedBranch = selectedBranchId
    ? branches.find((b) => b.id === selectedBranchId) ?? null
    : null;

  // Free-zone bounds for the anchored card. BranchDock at left:16 with width 240 (or 44
  // when minimized); ProjectList at right:16 with width 380 (44 when minimized). Account
  // for the minimized states so the card claims the freed space.
  const branchDockRight = 16 + (branchMin ? 44 : 240) + 8;
  const projectListLeft = mapDims.w - 16 - (listMin ? 44 : 380) - 8;
  const openProject = openProjectId
    ? projects.find((p) => p.id === openProjectId) ?? null
    : null;
  const openProjectBranch = openProject
    ? branches.find((b) => b.id === openProject.nearest_branch_id) ?? null
    : null;

  // Anchored card pixel position — zoom-aware AND pan-aware so the card stays
  // glued to the pin while the user zooms or space-drags.
  const anchoredPx = selectedBranch
    ? svgToPx(selectedBranch.svgX, selectedBranch.svgY, mapDims.w, mapDims.h, {
        zoom,
        centerX: selectedBranch.svgX + panX,
        centerY: selectedBranch.svgY + panY,
      })
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
        centerX={(selectedBranch?.svgX ?? SVG_VIEWBOX.width / 2) + panX}
        centerY={(selectedBranch?.svgY ?? SVG_VIEWBOX.height / 2) + panY}
        cursor={spaceHeld ? (panning ? 'grabbing' : 'grab') : 'auto'}
        onMouseDown={handleMapMouseDown}
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
              onClick={() => handleSelectBranch(b.id)}
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
                  onClick={() => handleSelectBranch(b.id)}
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
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />
      <AgentStatusRow />
      <BranchDock
        branches={branches}
        selectedId={selectedBranchId}
        setSelected={handleSelectBranch}
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
          containerW={mapDims.w}
          containerH={mapDims.h}
          headerH={headerH}
          freeLeft={branchDockRight}
          freeRight={projectListLeft}
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
