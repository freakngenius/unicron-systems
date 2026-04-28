'use client';

// Dashboard — top-level client component. The map layer is now Google Maps
// (@vis.gl/react-google-maps) instead of the prior synthetic SVG; all other
// chrome (TopBar, BranchDock, ProjectList, ProjectModal, ActivityRail, etc.)
// is unchanged.
//
// Responsibilities:
//   - holds top-level UI state (selected branch, source filter, cross-poll toggle,
//     open project, panel-minimized flags, activity-rail open flag, refresh state).
//   - composes the map (markers, clusterer, coverage circle, warm-intro polylines,
//     anchored card) inside <APIProvider> so child components can call useMap().

import * as React from 'react';
import { APIProvider, Map as GoogleMap, useMap } from '@vis.gl/react-google-maps';
import type { Branch, Customer, Project } from '@/lib/types';
import { TopBar, type SourceKey } from './TopBar';
import { BranchDock, type BranchStats } from './BranchDock';
import { ProjectList } from './ProjectList';
import { ProjectModal } from './ProjectModal';
import { AnchoredBranchCard } from './AnchoredBranchCard';
import { MapLegend } from './MapLegend';
import { CoordsHUD } from './CoordsHUD';
import { CrossPollBanner } from './CrossPollBanner';
import { ActivityRail, AgentStatusRow, useHeaderHeight } from './live';
import { ZoomControl, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from './ZoomControl';
import { PATHFINDER_DARK_STYLE } from '@/lib/map-style';
import { projectTier } from '@/lib/types-map';
import {
  BranchMarkerGM,
  CustomerMarkerGM,
  WarmPinGM,
} from './map/MapMarkers';
import { CoverageCircle } from './map/CoverageCircle';
import { MapController } from './map/MapController';
import { ProjectClusterLayer, type ClusterMarker } from './map/ProjectClusterLayer';
import { WarmIntroLines } from './map/WarmIntroLines';
import { useLatLngToPixel } from './map/useLatLngToPixel';

const HI_THRESHOLD = 80;
// Match the canonical Pathfinder dark style's base geometry color so the
// loading state doesn't flash darker than the tiles when they paint in.
const MAP_BG = '#212121';
const DEFAULT_CENTER = { lat: 39.5, lng: -98.5 };
const DEFAULT_ZOOM = 4;
const BRANCH_FOCUS_ZOOM = 7;

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

export function Dashboard({ initialBranches, initialCustomers, initialProjects }: DashboardProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // ── State ──────────────────────────────────────────────────────────────────
  const [selectedBranchId, setSelectedBranchId] = React.useState<string | null>(null);
  const [source, setSource] = React.useState<SourceKey>('all');
  const [crossPoll, setCrossPoll] = React.useState(false);
  const [openProjectId, setOpenProjectId] = React.useState<string | null>(null);
  const [branchMin, setBranchMin] = React.useState(false);
  const [listMin, setListMin] = React.useState(false);
  const [activityOpen, setActivityOpen] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [focusKey, setFocusKey] = React.useState(0);
  const [mapInstance, setMapInstance] = React.useState<google.maps.Map | null>(null);
  const [mapZoom, setMapZoom] = React.useState(DEFAULT_ZOOM);
  const [cardHidden, setCardHidden] = React.useState(false);

  const handleSelectBranch = React.useCallback((id: string | null) => {
    setSelectedBranchId(id);
    setFocusKey((k) => k + 1);
    setCardHidden(false); // re-show the anchored card whenever a branch is (re)picked
  }, []);

  // Click anywhere on the map (NOT a branch marker) → fade the anchored card.
  // Re-clicking the branch marker or the city in BranchDock brings it back.
  React.useEffect(() => {
    if (!mapInstance) return;
    const lis = mapInstance.addListener('click', () => setCardHidden(true));
    return () => lis.remove();
  }, [mapInstance]);

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
      setTimeout(() => setRefreshing(false), 1500);
    }
  }, [refreshing]);

  // ── Track live map zoom for the ZoomControl readout ────────────────────────
  React.useEffect(() => {
    if (!mapInstance) return;
    const update = () => setMapZoom(mapInstance.getZoom() ?? DEFAULT_ZOOM);
    update();
    const lis = mapInstance.addListener('zoom_changed', update);
    return () => lis.remove();
  }, [mapInstance]);

  const zoomIn = React.useCallback(() => {
    if (!mapInstance) return;
    const z = mapInstance.getZoom() ?? DEFAULT_ZOOM;
    mapInstance.setZoom(Math.min(16, z + 1));
  }, [mapInstance]);
  const zoomOut = React.useCallback(() => {
    if (!mapInstance) return;
    const z = mapInstance.getZoom() ?? DEFAULT_ZOOM;
    mapInstance.setZoom(Math.max(3, z - 1));
  }, [mapInstance]);

  // ── Keyboard: + / − zoom shortcuts (spacebar + drag is now native to GM) ──
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

  // ── Container size measurement (used by AnchoredBranchCard clamping) ──────
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

  // ── Derived: per-branch stats for the BranchDock ───────────────────────────
  const branchStats = React.useMemo<Record<string, BranchStats>>(() => {
    const m: Record<string, BranchStats> = {};
    for (const b of initialBranches) m[b.id] = { count: 0, hi: 0 };
    for (const p of initialProjects) {
      const bid = p.nearest_branch_id;
      if (!bid || !m[bid]) continue;
      m[bid].count += 1;
      if ((p.score ?? 0) >= HI_THRESHOLD) m[bid].hi += 1;
    }
    return m;
  }, [initialBranches, initialProjects]);

  // ── Derived: filtered project list for the right rail ──────────────────────
  const filteredProjects = React.useMemo<Project[]>(() => {
    if (crossPoll) {
      return initialProjects
        .filter((p) => !!p.warm_for_customer_id)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    }
    let r = selectedBranchId
      ? initialProjects.filter((p) => p.nearest_branch_id === selectedBranchId)
      : initialProjects.slice();
    if (source !== 'all') {
      const db = SOURCE_FILTER_TO_DB[source];
      r = r.filter((p) => p.source === db);
    }
    return r.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }, [initialProjects, selectedBranchId, source, crossPoll]);

  const totalForBranch = selectedBranchId
    ? initialProjects.filter((p) => p.nearest_branch_id === selectedBranchId).length
    : initialProjects.length;

  // ── Cross-poll: warm-intro lines (customer → project) ──────────────────────
  const warmLines = React.useMemo(() => {
    const byId = new Map(initialCustomers.map((c) => [c.id, c]));
    return initialProjects
      .filter((p) => !!p.warm_for_customer_id && p.lat != null && p.lon != null)
      .map((p) => {
        const c = byId.get(p.warm_for_customer_id as string);
        if (!c) return null;
        return {
          customer: c,
          project: p as Project & { lat: number; lon: number },
        };
      })
      .filter(Boolean) as { customer: Customer; project: Project & { lat: number; lon: number } }[];
  }, [initialCustomers, initialProjects]);

  const headerH = useHeaderHeight();
  const selectedBranch = selectedBranchId
    ? initialBranches.find((b) => b.id === selectedBranchId) ?? null
    : null;
  const openProject = openProjectId
    ? initialProjects.find((p) => p.id === openProjectId) ?? null
    : null;
  const openProjectBranch = openProject
    ? initialBranches.find((b) => b.id === openProject.nearest_branch_id) ?? null
    : null;

  const customersForBranch = selectedBranch
    ? initialCustomers.filter((c) => c.served_by_branch_id === selectedBranch.id).length
    : 0;

  // Free-zone bounds for the anchored card.
  const branchDockRight = 16 + (branchMin ? 44 : 240) + 8;
  const projectListLeft = mapDims.w - 16 - (listMin ? 44 : 380) - 8;

  // Project markers fed to the clusterer.
  const projectClusterMarkers = React.useMemo<ClusterMarker[]>(() => {
    if (crossPoll) return [];
    return initialProjects
      .filter((p) => p.lat != null && p.lon != null)
      .map((p) => {
        const tier = projectTier({
          score: p.score,
          ingested_at: p.ingested_at,
          warm_for_customer_id: p.warm_for_customer_id,
        });
        return {
          id: p.id,
          lat: p.lat as number,
          lng: p.lon as number,
          color: tier.color,
          hi: tier.isHi,
          onClick: () => setOpenProjectId(p.id),
        };
      });
  }, [initialProjects, crossPoll]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!apiKey) {
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
        }}
      >
        NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing — set it in .env.local
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ position: 'fixed', inset: 0, background: MAP_BG }}
      className="pf-root"
    >
      <APIProvider apiKey={apiKey} libraries={['marker', 'maps']}>
        {/* Map fills the whole container; chrome panels float over it. */}
        <div style={{ position: 'absolute', inset: 0 }}>
          {/* Inline `styles` from the new GCP Map Style editor (JSON-only).
              We use legacy <Marker> instead of <AdvancedMarker> so we don't
              need a mapId — and dropping mapId is what lets `styles` apply
              (Google ignores inline styles whenever a mapId is set). */}
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
            <MapController
              branches={initialBranches}
              projects={initialProjects}
              selectedBranchId={selectedBranchId}
              focusKey={focusKey}
              onMapReady={setMapInstance}
            />

            {/* Branch markers always visible; selected one floats above. */}
            {initialBranches.map((b) => (
              <BranchMarkerGM
                key={`b-${b.id}`}
                lat={b.lat}
                lng={b.lon}
                code={b.code}
                selected={b.id === selectedBranchId}
                onClick={() => handleSelectBranch(b.id)}
              />
            ))}


            {/* Default project layer (clustered, color-tiered). */}
            <ProjectClusterLayer markers={projectClusterMarkers} />

            {/* Cross-pollination overlay: customer markers + warm-intro lines + warm pins. */}
            {crossPoll && (
              <>
                {initialCustomers
                  .filter((c) => c.lat != null && c.lon != null)
                  .map((c) => (
                    <CustomerMarkerGM key={`c-${c.id}`} lat={c.lat} lng={c.lon} warm />
                  ))}
                <WarmIntroLines
                  lines={warmLines.map((l) => ({
                    from: { lat: l.customer.lat, lng: l.customer.lon },
                    to: { lat: l.project.lat, lng: l.project.lon },
                  }))}
                />
                {warmLines.map((l, i) => (
                  <WarmPinGM
                    key={`w-${i}`}
                    lat={l.project.lat}
                    lng={l.project.lon}
                    label={`WI-${i + 1}`}
                    onClick={() => setOpenProjectId(l.project.id)}
                  />
                ))}
              </>
            )}
          </GoogleMap>
        </div>

        {/* Coverage focus ring — DOM overlay sized in viewport pixels so it
            stays the same on-screen footprint regardless of zoom. */}
        {!crossPoll && selectedBranch && (
          <CoverageCircle lat={selectedBranch.lat} lng={selectedBranch.lon} />
        )}

        {/* Anchored branch card — floats over the map, glued to the branch lat/lng.
            Fades in/out via opacity (kept mounted while a branch is selected so the
            transition runs both directions). Click-away on the map hides it; clicking
            the branch marker / dock entry re-shows it. */}
        {!crossPoll && selectedBranch && (
          <AnchoredBranchCardOverlay
            branch={selectedBranch}
            containerW={mapDims.w}
            containerH={mapDims.h}
            headerH={headerH}
            freeLeft={branchDockRight}
            freeRight={projectListLeft}
            inRangeCount={branchStats[selectedBranch.id]?.count ?? 0}
            hiCount={branchStats[selectedBranch.id]?.hi ?? 0}
            customerCount={customersForBranch}
            hidden={cardHidden}
          />
        )}

        {/* Chrome panels — sit above the map div via z-index. */}
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
          branches={initialBranches}
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

        {crossPoll && <CrossPollBanner count={warmLines.length} />}
        <MapLegend crossPoll={crossPoll} />
        <ZoomControl
          zoom={mapZoom}
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
      </APIProvider>
    </div>
  );
}

// AnchoredBranchCardOverlay — wraps AnchoredBranchCard with the
// useLatLngToPixel hook so the card stays glued to the branch's lat/lng
// through pan + zoom. Fades opacity to 0 when `hidden` so the dismissal
// animates instead of cutting.
function AnchoredBranchCardOverlay(props: {
  branch: Branch;
  containerW: number;
  containerH: number;
  headerH: number;
  freeLeft: number;
  freeRight: number;
  inRangeCount: number;
  hiCount: number;
  customerCount: number;
  hidden: boolean;
}) {
  const { branch, hidden, ...rest } = props;
  const px = useLatLngToPixel(branch.lat, branch.lon);
  if (!px) return null;
  return (
    <div
      style={{
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? 'none' : 'auto',
        transition: 'opacity 220ms ease-out',
      }}
    >
      <AnchoredBranchCard branch={branch} anchorPx={px} {...rest} />
    </div>
  );
}
