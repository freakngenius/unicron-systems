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
import { useRouter, useSearchParams } from 'next/navigation';
import { APIProvider, Map as GoogleMap, useMap } from '@vis.gl/react-google-maps';
import type { Branch, CrossPollMatch, Customer, Project } from '@/lib/types';
import { TopBar, type SourceKey } from './TopBar';
import { BranchDock, type BranchStats } from './BranchDock';
import { ProjectList } from './ProjectList';
import { ProjectModal } from './ProjectModal';
import { AnchoredBranchCard } from './AnchoredBranchCard';
import { MapLegend } from './MapLegend';
import { CoordsHUD } from './CoordsHUD';
import { CrossPollBanner } from './CrossPollBanner';
import { ActivityRail, AgentStatusRow, useEscalations, useHeaderHeight } from './live';
import { StatPopover, type StatBucket } from './StatPopover';
import { EscalationPopover } from './EscalationPopover';
import { ZoomControl, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from './ZoomControl';
import { IntelligenceChat } from './chat';
import { buildSnapshot } from '@/lib/chat/context';
import { PATHFINDER_DARK_STYLE } from '@/lib/map-style';
import { projectTier } from '@/lib/types-map';
import { useHidden } from '@/lib/user-prefs';
import { useScoringConfig } from '@/lib/scoring-config';
import { useOrgGeoConfig } from '@/lib/org-config-client';
import { parseListFilterState } from '@/lib/list-filters';
import {
  applyNonBranchFilters,
  applyBranchFilter,
  groupCountsByBranch,
} from '@/lib/dashboard-filters';
import { pickDemoBranches, getActiveDemoBranchIds } from '@/lib/demo-branches';
import { indexMatchesByLead } from '@/lib/cross-poll-fetch';
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

const HI_THRESHOLD_FALLBACK = 80;
// Match the canonical Pathfinder dark style's base geometry color so the
// loading state doesn't flash darker than the tiles when they paint in.
const MAP_BG = '#212121';
// Centroid of CONUS at zoom 4.5 fits the lower 48 + most of southern Canada in
// a 1280-1600px viewport with side panels accounting for the 240+380 chrome.
const DEFAULT_CENTER = { lat: 39.5, lng: -98.5 };
const DEFAULT_ZOOM = 4.5;
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
  /** Demo Polish UX § Gate 2 — cross-pollination matches the engine has
   * already written to `pathfinder.lead_cross_pollination`, decorated with
   * a representative customer-site lat/lon at fetch time. Drives the
   * cross-pollination filter + warm-intro polyline overlay. Optional so
   * the dashboard still renders cleanly if the server-side fetch was
   * skipped or returned an error. */
  initialCrossPollMatches?: CrossPollMatch[];
  /** Demo Polish UX § Gate 7A flag — when true, every "open a project"
   * affordance (map pin click, list row, kanban tile, stat-popover row,
   * etc.) navigates to /leads/[projectId] instead of opening the legacy
   * ProjectModal overlay. Plumbed in from app/page.tsx where
   * `process.env.LEAD_DETAIL_REDESIGN === '1'` is read server-side. */
  redesignEnabled?: boolean;
}

export function Dashboard({
  initialBranches: initialBranchesRaw,
  initialCustomers,
  initialProjects,
  initialCrossPollMatches = [],
  redesignEnabled = false,
}: DashboardProps) {
  // Used by `openLead` below — declared after `setOpenProjectId` to
  // satisfy temporal-dead-zone access of the setter.
  const router = useRouter();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Demo Polish UX § Gate 1C — the dashboard's branch surface is restricted
  // to {Houston, LA, Nashville, Pittsburgh}. Other branches still exist in
  // pathfinder.branches (Phoenix / Atlanta / Chicago / Seattle) and still
  // back projects whose nearest_branch_id was computed before the demo
  // refocus, but the operator-facing chrome only renders the four demo
  // cities. `pickDemoBranches` preserves narrative order regardless of the
  // server-fetch order.
  //
  // Gate 17A — when `NEXT_PUBLIC_DEMO_HOUSTON_ONLY=1`, `pickDemoBranches`
  // narrows to Houston only. `projectsForDashboard` below also drops
  // projects whose nearest_branch_id is LAX/NSH/PIT so the right-rail
  // "See all" count and BranchDock totals reflect the Houston-only surface
  // rather than including LA/NSH/PIT-anchored projects with no visible
  // dock row.
  const initialBranches = React.useMemo(
    () => pickDemoBranches(initialBranchesRaw),
    [initialBranchesRaw],
  );

  // Demo Polish UX § Gate 2 — index cross-pollination matches by lead id so
  // the filter + warm-intro overlay can do O(1) lookups. When a project has
  // multiple matches, the highest-confidence one wins (`indexMatchesByLead`
  // handles the dedup).
  const xpollByLeadId = React.useMemo(
    () => indexMatchesByLead(initialCrossPollMatches),
    [initialCrossPollMatches],
  );
  const xpollLeadIds = React.useMemo(
    () => new Set(xpollByLeadId.keys()),
    [xpollByLeadId],
  );

  // ── State ──────────────────────────────────────────────────────────────────
  const [selectedBranchId, setSelectedBranchId] = React.useState<string | null>(null);
  const [source, setSource] = React.useState<SourceKey>('all');
  const [crossPoll, setCrossPoll] = React.useState(false);

  // Gate 18E — Houston-only mode no longer pre-filters the project corpus
  // by branch. The right-panel filter pill (Within / Outside / All) now
  // owns the active narrowing via applyNonBranchFilters' new
  // activeBranchIds branch-set check:
  //   - "Within Range" + Houston-only: leads attached to Houston (= within
  //     300 mi of the only visible coverage circle).
  //   - "Outside Range" + Houston-only: leads NOT attached to Houston, i.e.
  //     the whole rest of the country shown on the map.
  //   - "All": all leads regardless of branch proximity.
  //
  // Cross-poll mode keeps its full match set on top — the cross-poll
  // branch in applyNonBranchFilters bypasses both minScore and range so
  // the 12-match warm-intro view surfaces cleanly.
  const projectsForDashboard = initialProjects;
  const [openProjectId, setOpenProjectId] = React.useState<string | null>(null);
  // Demo Polish UX § Gate 7A flag — when on, every "open a project"
  // affordance navigates to the redesigned /leads/[projectId] page;
  // when off, the legacy ProjectModal overlay opens (existing behavior).
  // Single helper so every call site (map pin, list row, kanban tile,
  // stat-popover, anchored card) routes through one place.
  const openLead = React.useCallback(
    (projectId: string) => {
      if (redesignEnabled) {
        router.push(`/leads/${encodeURIComponent(projectId)}`);
      } else {
        setOpenProjectId(projectId);
      }
    },
    [redesignEnabled, router],
  );
  const [branchMin, setBranchMin] = React.useState(false);
  const [listMin, setListMin] = React.useState(false);
  const [activityOpen, setActivityOpen] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [focusKey, setFocusKey] = React.useState(0);
  const [mapInstance, setMapInstance] = React.useState<google.maps.Map | null>(null);
  const [mapZoom, setMapZoom] = React.useState(DEFAULT_ZOOM);
  const [cardHidden, setCardHidden] = React.useState(false);
  const [statBucket, setStatBucket] = React.useState<StatBucket | null>(null);
  const [escalationOpen, setEscalationOpen] = React.useState(false);
  const [chatOpen, setChatOpen] = React.useState(false);
  const escalations = useEscalations();

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

  // ── When the project modal opens, center + zoom the map underneath on
  //    the project's location. The modal sits centered over the map but
  //    leaves its edges visible; centering the map there means closing
  //    the modal reveals the exact spot the user was just inspecting.
  //    Zoom 11 ≈ city-block level, tight enough to show neighborhood
  //    context without the project marker drifting offscreen behind the
  //    modal. Project must have lat/lon (some news-source projects don't).
  React.useEffect(() => {
    if (!mapInstance || !openProjectId) return;
    const p = initialProjects.find((x) => x.id === openProjectId);
    if (!p || p.lat == null || p.lon == null) return;
    mapInstance.panTo({ lat: p.lat, lng: p.lon });
    mapInstance.setZoom(11);
  }, [mapInstance, openProjectId, initialProjects]);

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

  // ── User prefs (starred + hidden) — hoisted so every memo below can read it. ──
  const hidden = useHidden();

  // ── Demo Polish UX § Gate 1E — unified filter pipeline ─────────────────────
  // The BranchDock per-branch counts, the right-rail "X of Y" counter, the
  // ProjectList rendered rows, and the map cluster all read from the same
  // pipeline. Earlier code computed each on a different subset of
  // initialProjects, which drifted whenever a filter changed.
  //
  //   - preBranchFiltered: source + crossPoll + hidden + range + minScore.
  //     This is what the per-branch dock counts and the "Y" of "X of Y"
  //     reflect. Branch selection is NOT applied here so selecting Nashville
  //     does not zero out Houston's count in the dock.
  //   - withBranchFiltered: preBranchFiltered + selected branch. This is what
  //     the right-rail list and the map cluster render.
  //
  // Sort and starred filters still live inside ProjectList because they are
  // UI-local concerns that don't influence dock or cluster counts.
  const { high_priority_threshold } = useScoringConfig();
  const hiThreshold = high_priority_threshold || HI_THRESHOLD_FALLBACK;

  const searchParams = useSearchParams();
  const filterState = React.useMemo(() => parseListFilterState(searchParams), [searchParams]);

  const { config: orgGeoConfig } = useOrgGeoConfig();
  const maxDistance = orgGeoConfig.max_supported_distance_miles ?? 250;

  // Gate 18E — when the dashboard is narrowed to a small set of demo
  // branches (Houston-only or the four-city set), the range filter should
  // respect the visible coverage circles rather than the lead's
  // nearest_branch_id distance. Pass the active demo branch ids through
  // so applyNonBranchFilters can do a branch-set membership check.
  const activeBranchIdsSet = React.useMemo<ReadonlySet<string>>(
    () => new Set(getActiveDemoBranchIds()),
    [],
  );

  const preBranchFiltered = React.useMemo<Project[]>(
    () =>
      applyNonBranchFilters({
        projects: projectsForDashboard,
        source,
        crossPoll,
        hidden,
        state: filterState,
        maxDistance,
        crossPollLeadIds: xpollLeadIds,
        activeBranchIds: activeBranchIdsSet,
      }),
    [
      projectsForDashboard,
      source,
      crossPoll,
      hidden,
      filterState,
      maxDistance,
      xpollLeadIds,
      activeBranchIdsSet,
    ],
  );

  const withBranchFiltered = React.useMemo<Project[]>(
    () => applyBranchFilter(preBranchFiltered, selectedBranchId),
    [preBranchFiltered, selectedBranchId],
  );

  const branchStats = React.useMemo<Record<string, BranchStats>>(
    () =>
      groupCountsByBranch(
        preBranchFiltered,
        initialBranches.map((b) => b.id),
        hiThreshold,
      ),
    [preBranchFiltered, initialBranches, hiThreshold],
  );

  // The right-rail list pre-sort. ProjectList re-applies sort + starred so
  // it drives its own UI-local ordering; we hand it a stable score-desc
  // ordering as the input.
  const filteredProjects = React.useMemo<Project[]>(
    () => withBranchFiltered.slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    [withBranchFiltered],
  );

  // For the "X of Y" header — Y is the pre-branch-filtered corpus so the
  // operator sees how the active filters (source / range / minScore /
  // crossPoll) narrowed things, while X reflects the additional branch
  // narrowing.
  const totalForHeader = preBranchFiltered.length;

  // ── Cross-poll: warm-intro lines (customer → project) ──────────────────────
  // Demo Polish UX § Gate 2 — reads from the cross-pollination map (Path B)
  // instead of the multi-tenant `warm_for_customer_id` lookup. Each line
  // carries a `tier` (exact / fuzzy) the renderer uses to draw a solid vs
  // dashed magenta polyline. Pulls from `withBranchFiltered` so the overlay
  // tracks the same filter set as the right-rail list and map cluster.
  const warmLines = React.useMemo(() => {
    const out: {
      project: Project & { lat: number; lon: number };
      match: CrossPollMatch & { customer_lat: number; customer_lon: number };
    }[] = [];
    for (const p of withBranchFiltered) {
      if (p.lat == null || p.lon == null) continue;
      const m = xpollByLeadId.get(p.id);
      if (!m || m.customer_lat == null || m.customer_lon == null) continue;
      out.push({
        project: p as Project & { lat: number; lon: number },
        match: m as CrossPollMatch & { customer_lat: number; customer_lon: number },
      });
    }
    return out;
  }, [xpollByLeadId, withBranchFiltered]);

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

  // Project markers fed to the clusterer. Reads from withBranchFiltered so
  // the cluster count badges, the right-rail list, and the BranchDock
  // counts (per-branch from preBranchFiltered) all stay aligned with the
  // active filter set.
  const projectClusterMarkers = React.useMemo<ClusterMarker[]>(() => {
    if (crossPoll) return [];
    return withBranchFiltered
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
          onClick: () => openLead(p.id),
        };
      });
  }, [withBranchFiltered, crossPoll, openLead]);

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
              projects={projectsForDashboard}
              selectedBranchId={selectedBranchId}
              focusKey={focusKey}
              onMapReady={setMapInstance}
              defaultCenter={DEFAULT_CENTER}
              defaultZoom={DEFAULT_ZOOM}
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

            {/* Cross-pollination overlay: customer markers + warm-intro lines + warm pins.
                Demo Polish UX § Gate 2 — customer pins are placed at the
                cross-poll match's representative customer-site lat/lon
                (one per unique canonical name) and the polylines connect
                that pin to the project. Solid magenta = exact match,
                dashed faded magenta = fuzzy. */}
            {crossPoll && (
              <>
                {Array.from(
                  new Map(
                    warmLines.map((l) => [
                      l.match.customer_canonical,
                      { lat: l.match.customer_lat, lon: l.match.customer_lon },
                    ]),
                  ).entries(),
                ).map(([canon, c]) => (
                  <CustomerMarkerGM key={`c-${canon}`} lat={c.lat} lng={c.lon} warm />
                ))}
                <WarmIntroLines
                  lines={warmLines.map((l) => ({
                    from: { lat: l.match.customer_lat, lng: l.match.customer_lon },
                    to: { lat: l.project.lat, lng: l.project.lon },
                    tier: l.match.match_layer,
                  }))}
                />
                {warmLines.map((l, i) => (
                  <WarmPinGM
                    key={`w-${l.project.id}`}
                    lat={l.project.lat}
                    lng={l.project.lon}
                    label={`WI-${i + 1}`}
                    onClick={() => openLead(l.project.id)}
                  />
                ))}
              </>
            )}
          </GoogleMap>
        </div>

        {/* Coverage radius — native google.maps.Circle drawn at the branch
            lat/lng with a 300mi geographic radius. Pixel size scales with
            zoom; the circle always covers the same physical area on the map. */}
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
          onStatClick={(bucket) => setStatBucket((prev) => (prev === bucket ? null : bucket))}
          escalationCount={escalations.length}
          escalationOpen={escalationOpen}
          onEscalationClick={() => setEscalationOpen((v) => !v)}
          chatOpen={chatOpen}
          onChatToggle={() => setChatOpen((v) => !v)}
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
          totalCount={totalForHeader}
          onOpen={(p) => openLead(p.id)}
          crossPoll={crossPoll}
          minimized={listMin}
          setMinimized={setListMin}
        />

        {crossPoll && <CrossPollBanner count={warmLines.length} />}
        <MapLegend crossPoll={crossPoll} />
        <ZoomControl zoom={mapZoom} onZoomIn={zoomIn} onZoomOut={zoomOut} />
        <CoordsHUD branch={selectedBranch} />

        {openProject && (
          <ProjectModal
            project={openProject}
            branch={openProjectBranch}
            onClose={() => setOpenProjectId(null)}
          />
        )}

        {statBucket && (
          <StatPopover
            bucket={statBucket}
            projects={projectsForDashboard}
            rightOffset={statBucket === 'new' ? 240 : statBucket === 'total' ? 160 : 90}
            topOffset={84}
            onClose={() => setStatBucket(null)}
            onOpenProject={(p) => openLead(p.id)}
          />
        )}

        {escalationOpen && (
          <EscalationPopover
            branches={initialBranches}
            // Anchor under the EscalationPill — pill sits left of the four
            // LiveStat slots (each ~80-100px wide) and the LIVE indicator
            // (~80px). Right-offset of 380 lands the popover roughly under
            // the pill cluster without colliding with the LiveStats.
            rightOffset={380}
            topOffset={84}
            onClose={() => setEscalationOpen(false)}
            onOpenProject={(p) => openLead(p.id)}
          />
        )}

        <ActivityRail open={activityOpen} setOpen={setActivityOpen} />

        {/* Intelligence Chat panel — slides in from the right when open.
            ProjectList sits at right:16. The chat panel sits at right:0
            with width 420px and pushes ProjectList visually via z-order
            (chat is z=80, ProjectList is below). The map and other chrome
            don't reflow; ProjectList is always visible at right:16 but
            covered when chat is open. Plan § 5.1. */}
        <IntelligenceChat
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          snapshot={buildSnapshot({
            view: 'dashboard',
            selectedBranchId,
            openProjectId,
            sourceFilter: source,
            crossPoll,
            filteredProjects,
            totalProjects: totalForHeader,
            hiddenProjectIds: Array.from(hidden),
          })}
          branches={initialBranches}
          projects={projectsForDashboard}
          customers={initialCustomers}
        />
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
