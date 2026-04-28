// scripts/backfill.ts — synthetic projects + agent_log + agent_runs.
//
// Populates `pathfinder.projects` with ~30 plausible Zedcor-shaped opportunities
// so the dashboard has real data during dev/demo before Computer's Ingestor
// agent comes online. Mirrors `scripts/seed.ts` setup (service-role client,
// .env.local first then .env fallback). Idempotent — upserts on
// (source, source_id).
//
// Usage:
//   pnpm backfill
//
// Determinism:
//   - All lat/lon, scores, stages, sources are hardcoded.
//   - `score`, `nearest_branch_id`, `distance_miles`, `warm_for_customer_id`
//     are recomputed from lib/scoring.ts so the demo's numbers match what
//     the live Ranker would produce.

import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { scoreProject } from '../lib/scoring';
import type {
  AgentLogRow,
  AgentRun,
  Branch,
  Customer,
  ProjectSource,
} from '../lib/types';

dotenvConfig({ path: '.env.local' });
dotenvConfig();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

// We deliberately don't pass the `PathfinderDatabase` generic here — the
// generic flow + custom-schema option triggers a "never" overload mismatch
// in @supabase/supabase-js v2 that Stream 1's `scripts/seed.ts` also runs
// into. For a one-off node script (run via tsx, not bundled), the runtime
// contract is enforced by the migrations and the schema option below.
//
// Cast to `any` at the boundary so the row-typing is back to plain JS;
// every shape that touches the DB is still validated at runtime by RLS +
// PostgREST.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = createClient(url, serviceKey, {
  db: { schema: 'pathfinder' },
  auth: { persistSession: false, autoRefreshToken: false },
} as never) as unknown as { from: (t: string) => any };

// ---------- Synthetic project seed list ----------
//
// Every entry has a real lat/lon within ~100mi of one of the 5 branches.
// `intendedBranch` is purely advisory — the actual `nearest_branch_id` is
// recomputed by lib/scoring.ts from the seeded branches.

interface SeedProject {
  source_id: string;
  source: ProjectSource;
  title: string;
  summary: string;
  lat: number;
  lon: number;
  project_value: number | null;
  project_stage: 'RFP' | 'PRE' | 'PLN' | 'NWS';
  posted_date: string;
  rationale: string;
  outreach_hook: string;
  raw_payload: Record<string, unknown>;
}

const SEED_PROJECTS: SeedProject[] = [
  // ---- HOU (9 projects, mirrors prototype) ----
  {
    source_id: 'TXDOT-I45-2026-001',
    source: 'sam.gov',
    title: 'TxDOT I-45 corridor security expansion',
    summary: 'TxDOT scoping perimeter and intrusion-detection coverage along the I-45 north corridor — 14 right-of-way segments and 6 maintenance yards.',
    lat: 29.83,
    lon: -95.35,
    project_value: 4_200_000,
    project_stage: 'RFP',
    posted_date: '2026-04-22',
    rationale:
      "TxDOT's I-45 corridor expansion bundles 14 right-of-way segments and 6 maintenance yards into a single security RFP — the kind of multi-site scope where Zedcor's mobile-tower fleet outpriced a permanent-camera install on the SH-288 work two cycles ago.\n\nProject sits 12 miles from the HOU branch, well inside the 300-mile coverage radius, and tracks with the corridor work Zedcor already supports on Loop 610. The scope notes specifically call out 'temporary deterrent during phased construction,' which is the exact wedge our Houston team has won three times this year.\n\nPosted 2026-04-22 with a 21-day response window — pre-budget timing. Memorial Hermann (HOU customer) sits eight miles from the southern segment of the project; the campus-services VP there is the natural warm intro into the TxDOT decision committee.",
    outreach_hook:
      "Saw TxDOT's I-45 corridor RFP go up Tuesday — the temporary-deterrent line item looks identical to the SH-288 spec we ran for HCTRA last fall. Worth a 15-minute scope walk?",
    raw_payload: {
      source_id: 'TXDOT-I45-2026-001',
      agency: 'Texas Department of Transportation',
      naics: '561612',
      place_of_performance: 'Houston, TX',
      amount: 4_200_000,
      response_due: '2026-05-13',
    },
  },
  {
    source_id: 'HCDC-2026-074',
    source: 'harris',
    title: 'Harris Co. detention facility upgrade',
    summary: 'Harris County permit filing for perimeter and access-control upgrades at the Atascocita detention complex.',
    lat: 29.99,
    lon: -95.18,
    project_value: 2_600_000,
    project_stage: 'PRE',
    posted_date: '2026-04-21',
    rationale:
      "Harris County's detention services group filed a pre-construction permit at Atascocita this week, scoped at $2.6M for perimeter intrusion detection, exterior IP cameras, and a sallyport access-control retrofit. The line items match the spec our team wrote into the Plano facility RFP last year almost word-for-word.\n\nThe site sits 8 miles from the HOU branch — the closest active permit on our board this month. Pre-construction stage means the contractor short-list isn't locked yet; we're inside the window where a one-page response document still moves the needle.\n\nNo direct customer in the immediate area, but METRO Houston (HOU customer) has overlap with the county's facilities team — the chief of operations there sat on the joint working group two RFPs ago. Outreach through that path is faster than the cold cycle.",
    outreach_hook:
      "Harris Co. just filed the Atascocita perimeter permit — recognized the spec from the Plano work. Have a one-pager that maps the gaps in their current scope; want me to send it?",
    raw_payload: {
      source_id: 'HCDC-2026-074',
      permit_type: 'commercial-construction',
      filing_date: '2026-04-21',
      address: '14550 Atascocita Rd, Houston TX',
      contractor_listed: false,
    },
  },
  {
    source_id: 'GSA-FCO-HOU-2026-019',
    source: 'usaspending',
    title: 'Federal courthouse perimeter RFP',
    summary: 'GSA solicitation for perimeter security and visitor screening upgrades at the Bob Casey U.S. Courthouse.',
    lat: 29.55,
    lon: -95.08,
    project_value: 3_800_000,
    project_stage: 'RFP',
    posted_date: '2026-04-19',
    rationale:
      "The GSA's regional office posted an RFP for perimeter and visitor-screening upgrades at the Bob Casey courthouse — bollards, two new pedestrian portals, and the camera replacement we'd expect on a 12-year-old install. Work value tags at $3.8M.\n\nProject is 34 miles from the HOU branch, still well inside coverage. GSA work is GSA work — long approval, but predictable scope and a reliable payer. The Port of Houston work we delivered in Q3 is the closest analog we can cite in a capability brief.\n\nResponse window closes 2026-05-29. No warm-intro path inside this customer set; this is a cold RFP response, but the prior performance file from Port of Houston should land us a face-to-face with the contracting officer.",
    outreach_hook:
      "Saw the Bob Casey courthouse perimeter RFP — mirrors the visitor-screening scope we did for the Port of Houston in October. Sending capability brief tomorrow.",
    raw_payload: {
      source_id: 'GSA-FCO-HOU-2026-019',
      agency: 'General Services Administration',
      naics: '561621',
      place_of_performance: 'Houston, TX',
      amount: 3_800_000,
      response_due: '2026-05-29',
    },
  },
  {
    source_id: 'HC-METRO-2026-031',
    source: 'harris',
    title: 'METRO bus depot retrofit',
    summary: 'Harris County permit for the METRO Polk Street depot — yard cameras, fence upgrade, and a new operations-center vestibule.',
    lat: 29.74,
    lon: -95.32,
    project_value: 1_400_000,
    project_stage: 'PLN',
    posted_date: '2026-04-18',
    rationale:
      "METRO Houston filed a planning permit for the Polk Street bus depot retrofit — yard camera replacement, perimeter fence upgrade, and a new operations vestibule. The scope is small ($1.4M) but the customer is already on our books as METRO Houston, so this is account-expansion territory.\n\nDepot is 19 miles from HOU branch. Customer is on a multi-year contract; this is a scope add, not a competitive RFP.\n\nProject is in planning stage with a target start of 2026-Q3. Right window to lock the change order before the prime contractor selection — our account manager already has the relationship.",
    outreach_hook:
      "Polk Street depot retrofit just hit planning — looks like a clean scope add to the active METRO contract. Pulling the change-order draft now.",
    raw_payload: {
      source_id: 'HC-METRO-2026-031',
      permit_type: 'commercial-renovation',
      filing_date: '2026-04-18',
      address: '1900 Main St, Houston TX',
      contractor_listed: true,
    },
  },
  {
    source_id: 'NEWS-POH-2026-007',
    source: 'news',
    title: 'Port of Houston terminal access control',
    summary: 'Industry press reports Port of Houston Authority preparing a multi-terminal access-control modernization.',
    lat: 29.73,
    lon: -95.27,
    project_value: null,
    project_stage: 'NWS',
    posted_date: '2026-04-17',
    rationale:
      "Trade press flagged the Port of Houston Authority preparing a multi-terminal access-control modernization — Bayport, Barbours Cut, and Turning Basin — but no formal solicitation has dropped yet. Article quotes the PHA infrastructure director on a 'phased rollout starting late 2026.'\n\nPort is 22 miles from HOU branch and is already a Zedcor customer (Port of Houston Authority, monthly value $32K). This is renewal-plus-expansion territory — the existing relationship runs through the harbormaster's office, not the infrastructure group, so the warm intro is internal.\n\nNews stage means there's no RFP yet; the move is a relationship-pre-positioning call, not a bid.",
    outreach_hook:
      "Saw the trade-press piece on PHA's terminal access-control modernization — happy to map our current Bayport coverage against the rumored phase 1 scope.",
    raw_payload: {
      source_id: 'NEWS-POH-2026-007',
      publication: 'Port Strategy Magazine',
      url: 'https://example.com/port-strategy/poh-access-control',
      published_at: '2026-04-17T08:00:00Z',
    },
  },
  {
    source_id: 'SAM-EC-2026-014',
    source: 'sam.gov',
    title: 'Energy corridor security study',
    summary: 'SAM.gov RFI for a security assessment study covering 8 office complexes along the Houston Energy Corridor.',
    lat: 29.78,
    lon: -95.65,
    project_value: 900_000,
    project_stage: 'PLN',
    posted_date: '2026-04-15',
    rationale:
      "SAM.gov posted an RFI (request for information, study-stage) for an Energy Corridor security assessment — 8 office complexes, no implementation budget yet. Study fees tag at $900K.\n\nCorridor is 41 miles from HOU branch, near the western edge of the coverage radius. Centerpoint Energy West (HOU customer) sits 6 miles from the project area; the facilities team there has cycled twice through this kind of multi-tenant assessment.\n\nRFIs convert to RFPs at ~30% rates in our experience — worth a low-effort response. The Centerpoint relationship gives us a credible 'we know this corridor' angle.",
    outreach_hook:
      "Energy Corridor security RFI just dropped — Centerpoint already gets a quarterly read from us on three of the eight complexes. Worth a coordinated response?",
    raw_payload: {
      source_id: 'SAM-EC-2026-014',
      agency: 'Department of Energy (regional)',
      type: 'rfi',
      naics: '561621',
      place_of_performance: 'Houston, TX',
      response_due: '2026-05-15',
    },
  },
  {
    source_id: 'NEWS-MH-2026-022',
    source: 'news',
    title: 'Memorial Hermann campus expansion',
    summary: 'Memorial Hermann announces $400M campus expansion at the Texas Medical Center site.',
    lat: 29.71,
    lon: -95.4,
    project_value: null,
    project_stage: 'NWS',
    posted_date: '2026-04-14',
    rationale:
      "Memorial Hermann Health System announced a $400M expansion at its TMC campus — three new buildings, parking deck, and a service-yard reconfiguration. No public security spec yet, but the facilities VP we already work with confirmed off-hand that perimeter and access-control are 'in the early scope.'\n\nMH is 17 miles from HOU branch and is one of our larger HOU accounts (monthly $18K). Construction announcements typically convert to security work 6–9 months out; we're in the relationship-pre-positioning window.\n\nNo formal RFP. Action is to schedule a scope conversation with the facilities VP before the architect locks the security envelope.",
    outreach_hook:
      "TMC expansion announcement is great news — when's a good week to walk the early scope? We can pre-stage a one-pager on perimeter and parking-deck coverage.",
    raw_payload: {
      source_id: 'NEWS-MH-2026-022',
      publication: 'Houston Business Journal',
      url: 'https://example.com/hbj/memorial-hermann-expansion',
      published_at: '2026-04-14T13:00:00Z',
    },
  },
  {
    source_id: 'USA-GALVESTON-FLOOD-2026',
    source: 'usaspending',
    title: 'Galveston Co. flood control',
    summary: 'USACE-administered flood-control work along Galveston Bay — perimeter and equipment-yard security included in the spec.',
    lat: 29.3,
    lon: -94.95,
    project_value: 5_200_000,
    project_stage: 'RFP',
    posted_date: '2026-04-12',
    rationale:
      "USACE published a flood-control RFP along Galveston Bay — primarily civil work, but the spec includes perimeter and equipment-yard security as a sub-line valued at $5.2M. The civil prime is already short-listed; we'd be a sub.\n\nProject site is 58 miles from HOU branch — at the edge of useful but inside coverage. No existing customer in the immediate area; this is cold sub-bid territory and competes with two regional sub players.\n\nResponse to the prime is due 2026-05-26. Win probability is lower than the others on this list, but the dollar value is the highest.",
    outreach_hook:
      "USACE Galveston Bay flood-control RFP has a $5.2M security sub-line — happy to send the prime our standard sub-bid package if you want to forward it on.",
    raw_payload: {
      source_id: 'USA-GALVESTON-FLOOD-2026',
      agency: 'US Army Corps of Engineers',
      naics: '237990',
      place_of_performance: 'Galveston, TX',
      amount: 5_200_000,
      response_due: '2026-05-26',
    },
  },
  {
    source_id: 'HC-SUGARLAND-2026-009',
    source: 'harris',
    title: 'Sugar Land municipal complex',
    summary: 'Harris County permit for Sugar Land municipal complex security retrofit.',
    lat: 29.62,
    lon: -95.63,
    project_value: 1_100_000,
    project_stage: 'PRE',
    posted_date: '2026-04-11',
    rationale:
      "Sugar Land filed a pre-construction permit on the municipal complex — council chambers, public works yard, and the south parking annex. Scope value $1.1M. The permit lists a contractor (Pepper Construction regional), which means the security sub will be selected from the contractor's preferred list, not via open bid.\n\nProject is 24 miles from HOU branch. No direct customer warm-intro — Sugar Land has historically used a Houston regional integrator.\n\nMove is to surface ourselves to Pepper's regional office in Houston before the sub-list is locked. Pre-construction stage gives us ~30 days.",
    outreach_hook:
      "Sugar Land municipal complex permit lists Pepper as the contractor — worth a coffee with their Houston PM before they freeze the security sub-list?",
    raw_payload: {
      source_id: 'HC-SUGARLAND-2026-009',
      permit_type: 'commercial-renovation',
      filing_date: '2026-04-11',
      address: '2700 Town Center Blvd, Sugar Land TX',
      contractor_listed: true,
    },
  },

  // ---- PHX (cross-pollination + 5 more) ----
  {
    source_id: 'SAM-MARICOPA-RM-2026',
    source: 'sam.gov',
    title: 'Maricopa Co. records modernization',
    summary: 'Maricopa County records-modernization RFP including secure-area access and document-warehouse perimeter.',
    lat: 33.46,
    lon: -112.08,
    project_value: 2_800_000,
    project_stage: 'RFP',
    posted_date: '2026-04-22',
    rationale:
      "Maricopa County's records-modernization RFP includes a $2.8M security envelope — secure-area access at the central courthouse and perimeter coverage at the document warehouse. Pure RFP, not a permit.\n\nProject sits 1 mile from the PHX branch — bullseye coverage. Banner Health (PHX customer, $24.8K/mo) has overlap with the county's records team through a shared HIPAA-records committee; the IT director there is the natural warm-intro path.\n\nRFP closes 2026-05-22 — three weeks. The Banner relationship is the differentiator against the larger AZ integrators on the short-list.",
    outreach_hook:
      "Maricopa records-mod RFP is up — Banner Health's IT director sits on the shared records committee. Want to coordinate a warm intro before we cold-respond?",
    raw_payload: {
      source_id: 'SAM-MARICOPA-RM-2026',
      agency: 'Maricopa County',
      naics: '561621',
      place_of_performance: 'Phoenix, AZ',
      amount: 2_800_000,
      response_due: '2026-05-22',
    },
  },
  {
    source_id: 'SAM-PHX-SKY-PARK-2026',
    source: 'sam.gov',
    title: 'Phoenix Sky Harbor parking garage retrofit',
    summary: 'Phoenix Sky Harbor RFP for parking-garage CCTV and access-control retrofit on Garages 4 and 5.',
    lat: 33.4373,
    lon: -112.0078,
    project_value: 3_400_000,
    project_stage: 'RFP',
    posted_date: '2026-04-21',
    rationale:
      "Phoenix Sky Harbor posted an RFP for CCTV and access-control retrofit on Garages 4 and 5 — $3.4M. Aviation work is its own qualification track, but the spec mirrors the LAX work several of our peers have run, so it's not unfamiliar territory.\n\nGarage 4 sits 4 miles from PHX branch. ASU (PHX customer) and Salt River Project (PHX customer) both have vendor relationships that overlap with airport facilities; SRP's facilities VP has previously brokered intros at airport-adjacent contracts.\n\nResponse closes 2026-05-21. Aviation prime contractors prefer pre-qualified subs — the move is to file the aviation pre-qual paperwork in parallel with the bid response.",
    outreach_hook:
      "Sky Harbor Garages 4/5 RFP just dropped — SRP's facilities VP previously brokered the airport-adjacent intro. Worth pulling that thread now?",
    raw_payload: {
      source_id: 'SAM-PHX-SKY-PARK-2026',
      agency: 'City of Phoenix Aviation Department',
      naics: '561621',
      place_of_performance: 'Phoenix, AZ',
      amount: 3_400_000,
      response_due: '2026-05-21',
    },
  },
  {
    source_id: 'NEWS-ASU-RES-2026',
    source: 'news',
    title: 'ASU Tempe residence hall expansion',
    summary: 'Arizona State University announces $180M residence-hall expansion at the Tempe campus.',
    lat: 33.42,
    lon: -111.93,
    project_value: null,
    project_stage: 'NWS',
    posted_date: '2026-04-19',
    rationale:
      "ASU announced a $180M residence-hall expansion at Tempe — three new buildings on the south side of the campus. Press release referenced 'integrated security and life-safety systems' but no spec yet.\n\nASU is 11 miles from the PHX branch and is already a Zedcor customer (monthly $22.3K). The campus security director is on our books; the residence-hall project rolls up through the auxiliary-services VP, who's a different relationship to build.\n\nNews stage — no bid. Move is to lean on the existing campus relationship to schedule a scope conversation with auxiliary services before the architect locks the security envelope.",
    outreach_hook:
      "Saw ASU's $180M Tempe residence-hall announcement — good moment to ask the security director for a warm intro to auxiliary services before architects lock spec.",
    raw_payload: {
      source_id: 'NEWS-ASU-RES-2026',
      publication: 'AZ Big Media',
      url: 'https://example.com/azbigmedia/asu-residence-expansion',
      published_at: '2026-04-19T11:00:00Z',
    },
  },
  {
    source_id: 'USA-NAVAJO-CHEM-2026',
    source: 'usaspending',
    title: 'Navajo Generating Station decommissioning security',
    summary: 'USACE-administered decommissioning at Navajo Generating Station — perimeter and ash-yard security in scope.',
    lat: 36.91,
    lon: -111.39,
    project_value: 1_900_000,
    project_stage: 'PLN',
    posted_date: '2026-04-16',
    rationale:
      "USACE plans a $1.9M security envelope around the Navajo Generating Station decommissioning — multi-year perimeter for the ash-yard remediation. Project is at planning stage; bid documents expected 2026-Q3.\n\nSite is 220 miles from PHX branch, near the edge of the 300-mile coverage. The remoteness is actually a fit for the mobile-tower model — there's no permanent-cam vendor that'd compete on cost for a 36-month temporary install.\n\nNo customer warm-intro — this is a cold federal opportunity, but the temporary-install economics are unusually strong. Worth a low-effort capability brief now.",
    outreach_hook:
      "Navajo Generating decom is heading toward bid — 36-month temporary perimeter is exactly the mobile-tower wheelhouse. Sending capability brief this week.",
    raw_payload: {
      source_id: 'USA-NAVAJO-CHEM-2026',
      agency: 'US Army Corps of Engineers',
      naics: '562910',
      place_of_performance: 'Page, AZ',
      amount: 1_900_000,
      response_due: '2026-09-15',
    },
  },
  {
    source_id: 'HC-PHX-PORTPHX-2026',
    source: 'harris',
    title: 'Phoenix Convention Center loading-dock retrofit',
    summary: 'Phoenix permit for Convention Center loading-dock and back-of-house security upgrade.',
    lat: 33.45,
    lon: -112.07,
    project_value: 720_000,
    project_stage: 'PRE',
    posted_date: '2026-04-13',
    rationale:
      "Phoenix Convention Center filed a $720K pre-construction permit for loading-dock and back-of-house security — bollards, two new gates, and a refresh of the dock-camera coverage. Small scope but inside the city's preferred-vendor program.\n\nDock is 1 mile from PHX branch. Maricopa County Public Works (PHX customer) has crossover with the convention-center facilities team through the city events committee.\n\nPre-construction stage means the city is still weighing in-house vs. outside vendor. Move is to ride the Maricopa relationship to schedule a 30-min city-events scoping call.",
    outreach_hook:
      "Convention Center dock retrofit permit just filed — Maricopa County facilities sits on the events committee. Worth a coordinated intro?",
    raw_payload: {
      source_id: 'HC-PHX-PORTPHX-2026',
      permit_type: 'commercial-renovation',
      filing_date: '2026-04-13',
      address: '100 N 3rd St, Phoenix AZ',
      contractor_listed: false,
    },
  },

  // ---- ATL (cross-pollination + 4 more) ----
  {
    source_id: 'USA-ATL-FCO-2026',
    source: 'usaspending',
    title: 'Atlanta federal courthouse perimeter RFP',
    summary: 'GSA RFP for perimeter and visitor-screening upgrades at the Richard B. Russell federal building.',
    lat: 33.76,
    lon: -84.39,
    project_value: 5_100_000,
    project_stage: 'RFP',
    posted_date: '2026-04-20',
    rationale:
      "GSA's southeast region posted a $5.1M RFP for perimeter and visitor-screening upgrades at the Russell federal building — bollards, four pedestrian portals, and a wholesale CCTV refresh. The Bob Casey scope in Houston is the closest analog and we're already responding to that one.\n\nBuilding is in downtown ATL, 0.5 miles from the ATL branch. Centennial Trust Properties (ATL customer) has overlap with the federal-tenant working group through a shared building-services contract.\n\nRFP closes 2026-05-25. Combining this response with Houston's lets us pitch GSA on a multi-region capability — a real differentiator.",
    outreach_hook:
      "Russell federal building RFP just dropped — same scope as the Bob Casey work in Houston. Centennial Trust has the warm-intro path. Coordinating a multi-region brief.",
    raw_payload: {
      source_id: 'USA-ATL-FCO-2026',
      agency: 'General Services Administration',
      naics: '561621',
      place_of_performance: 'Atlanta, GA',
      amount: 5_100_000,
      response_due: '2026-05-25',
    },
  },
  {
    source_id: 'NEWS-MARTA-2026-018',
    source: 'news',
    title: 'MARTA Five Points station security overhaul',
    summary: 'MARTA confirms $42M station-security capital plan starting at Five Points.',
    lat: 33.754,
    lon: -84.39,
    project_value: null,
    project_stage: 'NWS',
    posted_date: '2026-04-19',
    rationale:
      "MARTA confirmed a $42M station-security capital plan, starting with Five Points. Press release scoped CCTV, fare-line surveillance, and emergency-response upgrades; no bid documents yet.\n\nMARTA is 1 mile from ATL branch and is already a Zedcor customer ($19.7K/mo). This is a clean account-expansion lead. The transit-security director is on our books.\n\nNews stage — no formal bid yet. Move is the relationship call before the architect-of-record locks the security envelope.",
    outreach_hook:
      "MARTA's $42M station-security capital plan is great news — when's a good week to walk the Five Points scope before the AOR locks?",
    raw_payload: {
      source_id: 'NEWS-MARTA-2026-018',
      publication: 'AJC',
      url: 'https://example.com/ajc/marta-station-security',
      published_at: '2026-04-19T09:30:00Z',
    },
  },
  {
    source_id: 'SAM-EMORY-RES-2026',
    source: 'sam.gov',
    title: 'Emory University research-park security study',
    summary: 'Emory University RFI for security assessment of the research-park complex.',
    lat: 33.79,
    lon: -84.32,
    project_value: 480_000,
    project_stage: 'PLN',
    posted_date: '2026-04-15',
    rationale:
      "Emory University posted a $480K RFI for a security-assessment study covering its research-park complex — 6 buildings, mostly biomedical labs. Implementation is implied but not yet funded.\n\nEmory Healthcare (ATL customer, $26.1K/mo) is the parent system; the research-park is a sister entity but the procurement teams overlap. Site is 4 miles from ATL branch.\n\nRFI close is 2026-05-15. Studies convert to RFPs at ~30%; the Emory Healthcare relationship gives us a strong inside track if we participate in the study.",
    outreach_hook:
      "Emory research-park security RFI just opened — Emory Healthcare procurement is shared. Want me to draft the response with the warm-intro language?",
    raw_payload: {
      source_id: 'SAM-EMORY-RES-2026',
      agency: 'Emory University',
      type: 'rfi',
      naics: '561621',
      place_of_performance: 'Atlanta, GA',
      response_due: '2026-05-15',
    },
  },
  {
    source_id: 'HC-ATL-AIRPORT-2026',
    source: 'harris',
    title: 'Hartsfield-Jackson concourse F security retrofit',
    summary: 'Hartsfield-Jackson permit for Concourse F security retrofit — CCTV and access-control replacement.',
    lat: 33.64,
    lon: -84.43,
    project_value: 4_900_000,
    project_stage: 'PRE',
    posted_date: '2026-04-17',
    rationale:
      "Hartsfield-Jackson filed a $4.9M permit for Concourse F security retrofit — wholesale CCTV and access-control replacement. Aviation work, so the prime is one of three pre-qualified contractors; we'd be a sub.\n\nAirport is 11 miles from ATL branch. No existing customer warm-intro inside the airport, but Sky Harbor RFP (PHX) gives us aviation-adjacent capability proof for the sub package.\n\nPre-construction stage — sub-list selection in 4–6 weeks. Move is to file the airport-vendor pre-qual paperwork (3-week process) in parallel.",
    outreach_hook:
      "Hartsfield Concourse F retrofit permit just filed — let's start the airport-vendor pre-qual now so we're inside the window when the prime selects subs.",
    raw_payload: {
      source_id: 'HC-ATL-AIRPORT-2026',
      permit_type: 'commercial-renovation',
      filing_date: '2026-04-17',
      address: '6000 N Terminal Pkwy, Atlanta GA',
      contractor_listed: true,
    },
  },
  {
    source_id: 'NEWS-GATECH-2026-006',
    source: 'news',
    title: 'Georgia Tech research-corridor expansion',
    summary: 'Georgia Tech announces $220M research-corridor expansion north of campus.',
    lat: 33.776,
    lon: -84.398,
    project_value: null,
    project_stage: 'NWS',
    posted_date: '2026-04-10',
    rationale:
      "Georgia Tech announced a $220M research-corridor expansion. Three new lab buildings, parking deck, and shared loading yard. No security spec public yet.\n\nGeorgia Tech Facilities (ATL customer, $15.3K/mo) is the relationship of record. Site is 1 mile from ATL branch.\n\nNews stage. Action is the relationship call before the architect lock.",
    outreach_hook:
      "Georgia Tech research-corridor announcement — worth getting on the auxiliary-services calendar before architect lock?",
    raw_payload: {
      source_id: 'NEWS-GATECH-2026-006',
      publication: 'Atlanta Inno',
      url: 'https://example.com/atlinno/gatech-corridor',
      published_at: '2026-04-10T07:00:00Z',
    },
  },

  // ---- CHI (5 projects) ----
  {
    source_id: 'SAM-COOK-COJAIL-2026',
    source: 'sam.gov',
    title: 'Cook County jail facility upgrade',
    summary: 'Cook County RFP for $6.4M perimeter and intrusion-detection upgrade across the Cermak campus.',
    lat: 41.86,
    lon: -87.69,
    project_value: 6_400_000,
    project_stage: 'RFP',
    posted_date: '2026-04-22',
    rationale:
      "Cook County's $6.4M RFP for perimeter and intrusion detection at the Cermak jail campus is the largest single corrections opportunity on the board this quarter. Scope mirrors the work we did at Atascocita in Houston — multi-zone IDS, exterior IP cameras, and sallyport access control.\n\nFacility is 2 miles from CHI branch. Chicago Transit Authority (CHI customer, $29.4K/mo) has a shared infrastructure-services contract with the county; the CTA director sits on the joint procurement working group.\n\nRFP closes 2026-05-26. Atascocita is the prior-performance reference. Combine with the CTA warm-intro and we're a top-three bidder.",
    outreach_hook:
      "Cook County jail RFP just dropped — Atascocita is a clean reference and CTA's director sits on the joint procurement group. Want to coordinate the response?",
    raw_payload: {
      source_id: 'SAM-COOK-COJAIL-2026',
      agency: 'Cook County',
      naics: '561621',
      place_of_performance: 'Chicago, IL',
      amount: 6_400_000,
      response_due: '2026-05-26',
    },
  },
  {
    source_id: 'HC-CHI-OHARE-2026',
    source: 'harris',
    title: "O'Hare cargo facility expansion",
    summary: "O'Hare permit for cargo-facility expansion — perimeter and yard-camera scope included.",
    lat: 41.97,
    lon: -87.91,
    project_value: 2_300_000,
    project_stage: 'PRE',
    posted_date: '2026-04-18',
    rationale:
      "O'Hare filed a $2.3M permit for cargo-facility expansion — new yard, perimeter fence, and an outdoor camera grid. Aviation work, but freight-side, which is a different procurement track from passenger-terminal.\n\nO'Hare Facilities (CHI customer, $34.8K/mo) is one of our top accounts. The freight-side relationship is separate but the customer can broker the intro inside 48h.\n\nPre-construction stage. Sub-list selection inside 30 days. Move is the warm intro this week.",
    outreach_hook:
      "O'Hare cargo expansion permit just filed — same airport, different procurement track. Can you ping our O'Hare contact for the freight-side intro this week?",
    raw_payload: {
      source_id: 'HC-CHI-OHARE-2026',
      permit_type: 'commercial-renovation',
      filing_date: '2026-04-18',
      address: '11600 W Irving Park Rd, Chicago IL',
      contractor_listed: true,
    },
  },
  {
    source_id: 'USA-CHI-VA-2026',
    source: 'usaspending',
    title: 'Hines VA Hospital perimeter upgrade',
    summary: 'VA-administered perimeter and access-control upgrade at the Edward Hines VA hospital campus.',
    lat: 41.86,
    lon: -87.83,
    project_value: 2_700_000,
    project_stage: 'RFP',
    posted_date: '2026-04-16',
    rationale:
      "VA Greater Chicago posted a $2.7M RFP for perimeter and access-control upgrade at the Hines VA campus. Federal-medical work, with the typical 90-day response window and strong prior-performance weighting.\n\nCampus is 12 miles from CHI branch. No direct customer warm-intro — this is a cold federal-medical bid. Our prior performance at Memorial Hermann (HOU) is the closest medical reference we can cite.\n\nResponse closes 2026-07-16 — long runway. Worth a measured response, not rushed.",
    outreach_hook:
      "Hines VA perimeter RFP is up — citing Memorial Hermann as a prior-performance reference. Pulling the response draft for review next week.",
    raw_payload: {
      source_id: 'USA-CHI-VA-2026',
      agency: 'Department of Veterans Affairs',
      naics: '561621',
      place_of_performance: 'Hines, IL',
      amount: 2_700_000,
      response_due: '2026-07-16',
    },
  },
  {
    source_id: 'NEWS-UC-2026-011',
    source: 'news',
    title: 'United Center renovation phase 2',
    summary: 'United Center announces phase-2 renovation focusing on premium-area access control.',
    lat: 41.881,
    lon: -87.674,
    project_value: null,
    project_stage: 'NWS',
    posted_date: '2026-04-13',
    rationale:
      "United Center announced phase 2 of its renovation, focused on premium-area access control and concourse CCTV. Phase 1 was a competitor; we're the underdog incumbent for phase 2.\n\nUnited Center Operations (CHI customer, $16.2K/mo) is on our books — that's the warm intro. Site is 1 mile from CHI branch.\n\nNews stage. The relationship lift is to convert the existing back-of-house contract into a phase-2 sub role with the prime.",
    outreach_hook:
      "UC phase 2 announcement — let's get our account contact to broker the prime intro before the sub-list closes. Phase 1 was a miss; phase 2 is winnable.",
    raw_payload: {
      source_id: 'NEWS-UC-2026-011',
      publication: 'Crain\'s Chicago Business',
      url: 'https://example.com/crains/united-center-renovation',
      published_at: '2026-04-13T08:00:00Z',
    },
  },
  {
    source_id: 'SAM-MWRD-CHI-2026',
    source: 'sam.gov',
    title: 'Metropolitan Water Reclamation District plant security',
    summary: 'MWRD RFP for water-reclamation plant security — Stickney facility.',
    lat: 41.81,
    lon: -87.77,
    project_value: 1_700_000,
    project_stage: 'PLN',
    posted_date: '2026-04-09',
    rationale:
      "MWRD posted a planning notice for $1.7M plant-security work at the Stickney water-reclamation facility. Critical-infrastructure work, with NERC-CIP-adjacent compliance overhead.\n\nMetro Water Reclamation (CHI customer, $14.9K/mo) is the same agency. Stickney is 9 miles from CHI branch.\n\nPlanning stage — RFP expected mid-summer. Move is the early-engagement scoping call to position ourselves before the spec is locked.",
    outreach_hook:
      "MWRD Stickney plant-security planning notice is up — we're already on the books at MWRD. Setting the early-engagement call now.",
    raw_payload: {
      source_id: 'SAM-MWRD-CHI-2026',
      agency: 'Metropolitan Water Reclamation District',
      naics: '561621',
      place_of_performance: 'Stickney, IL',
      amount: 1_700_000,
      response_due: '2026-07-15',
    },
  },

  // ---- SEA (5 projects) ----
  {
    source_id: 'SAM-POS-TERM-2026',
    source: 'sam.gov',
    title: 'Port of Seattle terminal access control',
    summary: 'Port of Seattle RFP for $4.1M access-control modernization across Terminals 5 and 18.',
    lat: 47.59,
    lon: -122.34,
    project_value: 4_100_000,
    project_stage: 'RFP',
    posted_date: '2026-04-22',
    rationale:
      "Port of Seattle posted a $4.1M RFP for access-control modernization across Terminals 5 and 18 — biometric portals, sallyports, and the dock-side camera replacement Phase 1 didn't get to.\n\nPort of Seattle Authority (SEA customer, $22.8K/mo) is the same agency. Terminal 5 is 4 miles from SEA branch.\n\nRFP closes 2026-05-22. Account expansion — incumbent advantage. Move is to lean on the existing relationship for the pre-bid technical conference.",
    outreach_hook:
      "POS Terminals 5/18 access-control RFP is up — incumbent edge. Confirm we're on the pre-bid tech conference list?",
    raw_payload: {
      source_id: 'SAM-POS-TERM-2026',
      agency: 'Port of Seattle',
      naics: '561621',
      place_of_performance: 'Seattle, WA',
      amount: 4_100_000,
      response_due: '2026-05-22',
    },
  },
  {
    source_id: 'HC-SEA-BOEING-2026',
    source: 'harris',
    title: 'Boeing Renton flight-line security retrofit',
    summary: 'Boeing Renton facility permit for flight-line security and yard-camera retrofit.',
    lat: 47.49,
    lon: -122.21,
    project_value: 3_200_000,
    project_stage: 'PRE',
    posted_date: '2026-04-19',
    rationale:
      "Boeing's Renton facility filed a $3.2M permit for flight-line security and yard-camera retrofit. Aerospace work — strict ITAR overlay on vendor selection.\n\nBoeing Commercial Sites (SEA customer, $27.3K/mo) is the relationship. Site is 12 miles from SEA branch.\n\nPre-construction stage. ITAR pre-qual is already in place from prior Boeing work. Move is the technical-fit call this week.",
    outreach_hook:
      "Boeing Renton permit just filed — ITAR pre-qual already in place from prior work. Setting the tech-fit call.",
    raw_payload: {
      source_id: 'HC-SEA-BOEING-2026',
      permit_type: 'commercial-renovation',
      filing_date: '2026-04-19',
      address: '737 Logan Ave N, Renton WA',
      contractor_listed: false,
    },
  },
  {
    source_id: 'USA-SEA-FED-COURT-2026',
    source: 'usaspending',
    title: 'Seattle federal courthouse perimeter upgrade',
    summary: 'GSA RFP for perimeter and visitor-screening upgrades at the William Kenzo Nakamura courthouse.',
    lat: 47.61,
    lon: -122.33,
    project_value: 2_900_000,
    project_stage: 'RFP',
    posted_date: '2026-04-15',
    rationale:
      "GSA's northwest region posted a $2.9M RFP for perimeter and visitor-screening upgrades at the Nakamura courthouse. The Bob Casey (HOU) and Russell (ATL) RFPs from this same cycle make a multi-region capability brief credible.\n\nSite is 1 mile from SEA branch. No customer warm-intro path; this is a cold federal RFP, but stacking three GSA responses in a single quarter is a strong narrative.\n\nResponse closes 2026-05-15. Coordinate with the HOU and ATL responses to share the pre-bid Q&A research.",
    outreach_hook:
      "Nakamura courthouse RFP closes the GSA-courthouse trifecta this quarter (Houston + Atlanta + Seattle). Drafting the multi-region narrative now.",
    raw_payload: {
      source_id: 'USA-SEA-FED-COURT-2026',
      agency: 'General Services Administration',
      naics: '561621',
      place_of_performance: 'Seattle, WA',
      amount: 2_900_000,
      response_due: '2026-05-15',
    },
  },
  {
    source_id: 'NEWS-UW-2026-008',
    source: 'news',
    title: 'University of Washington medical campus expansion',
    summary: 'UW announces $310M medical campus expansion at the South Lake Union site.',
    lat: 47.65,
    lon: -122.34,
    project_value: null,
    project_stage: 'NWS',
    posted_date: '2026-04-12',
    rationale:
      "UW announced a $310M medical campus expansion at South Lake Union. Multi-building, multi-year, with the typical lab-security overlay (controlled-substances rooms, biosafety zones, restricted research wings).\n\nUniversity of Washington (SEA customer, $17.1K/mo) is the relationship. Site is 4 miles from SEA branch.\n\nNews stage. The medical-research overlay is exactly the security-spec specialty we lead with at TMC (Memorial Hermann). Move is the relationship call before the architect lock.",
    outreach_hook:
      "UW South Lake Union announcement — controlled-substances and biosafety overlays are the TMC playbook. Setting the security-director call.",
    raw_payload: {
      source_id: 'NEWS-UW-2026-008',
      publication: 'GeekWire',
      url: 'https://example.com/geekwire/uw-medical-expansion',
      published_at: '2026-04-12T10:00:00Z',
    },
  },
  {
    source_id: 'SAM-PCC-WA-2026',
    source: 'sam.gov',
    title: 'Pierce County construction-corridor security',
    summary: 'Pierce County RFI for security assessment of the Tacoma waterfront construction corridor.',
    lat: 47.25,
    lon: -122.44,
    project_value: 620_000,
    project_stage: 'PLN',
    posted_date: '2026-04-08',
    rationale:
      "Pierce County posted a $620K RFI for a security-assessment study covering 9 active construction sites along the Tacoma waterfront. Mobile-tower territory — temporary deterrent, multi-site, short notice-to-proceed.\n\nPierce County Construction (SEA customer, $8.2K/mo) is on the books. Site is 28 miles from SEA branch.\n\nPlanning stage — RFI close 2026-05-08. The mobile-tower economics here outperform any permanent-cam option; the existing PCC relationship is the warm intro.",
    outreach_hook:
      "Pierce County waterfront security RFI is up — exactly the mobile-tower wheelhouse and PCC is already on our books. Drafting the response.",
    raw_payload: {
      source_id: 'SAM-PCC-WA-2026',
      agency: 'Pierce County',
      type: 'rfi',
      naics: '561621',
      place_of_performance: 'Tacoma, WA',
      response_due: '2026-05-08',
    },
  },
];

// ---------- Backfill orchestration ----------

async function loadBranchesAndCustomers(): Promise<{
  branches: Branch[];
  customers: Customer[];
}> {
  const { data: branches, error: bErr } = await supabase.from('branches').select('*');
  if (bErr) throw bErr;
  const { data: customers, error: cErr } = await supabase.from('customers').select('*');
  if (cErr) throw cErr;
  const b = (branches ?? []) as Branch[];
  const c = (customers ?? []) as Customer[];
  if (b.length === 0) throw new Error('No branches found — run `pnpm seed` first.');
  if (c.length === 0) throw new Error('No customers found — run `pnpm seed` first.');
  return { branches: b, customers: c };
}

interface ScoredSeed extends SeedProject {
  score: number;
  nearest_branch_id: string;
  distance_miles: number;
  warm_for_customer_id: string | null;
}

function score(seed: SeedProject, branches: Branch[], customers: Customer[]): ScoredSeed {
  const out = scoreProject({
    project: {
      lat: seed.lat,
      lon: seed.lon,
      project_value: seed.project_value,
      project_stage: seed.project_stage,
    },
    branches,
    customers,
  });
  return {
    ...seed,
    score: out.composite_score,
    nearest_branch_id: out.nearest_branch_id,
    distance_miles: Math.round(out.distance_miles * 10) / 10,
    warm_for_customer_id: out.warm_for_customer_id,
  };
}

async function upsertProjects(scored: ScoredSeed[]): Promise<number> {
  const now = new Date().toISOString();
  const inserts = scored.map((s) => ({
    id: `${s.source}:${s.source_id}`,
    source: s.source,
    source_id: s.source_id,
    title: s.title,
    summary: s.summary,
    lat: s.lat,
    lon: s.lon,
    project_value: s.project_value,
    project_stage: s.project_stage,
    posted_date: s.posted_date,
    raw_payload: s.raw_payload,
    rationale: s.rationale,
    rationale_streamed_at: now,
    score: s.score,
    nearest_branch_id: s.nearest_branch_id,
    distance_miles: s.distance_miles,
    outreach_hook: s.outreach_hook,
    warm_for_customer_id: s.warm_for_customer_id,
    ingested_at: now,
    ranked_at: now,
  }));

  const { error, count } = await supabase
    .from('projects')
    .upsert(inserts, { onConflict: 'source,source_id', count: 'exact' });
  if (error) throw error;
  return count ?? inserts.length;
}

type AgentLogInsert = Omit<AgentLogRow, 'id' | 'ts'> & { ts?: string };

async function writeAgentLogs(scored: ScoredSeed[]): Promise<number> {
  const now = Date.now();
  const rows: AgentLogInsert[] = [];

  // 20 ingestor entries (oldest first, ~1 minute apart, up to 60 min ago)
  const subset = scored.slice(0, 20);
  subset.forEach((p, i) => {
    rows.push({
      agent_name: 'ingestor',
      event_type: i === 0 ? 'ingest_start' : 'source_fetch',
      event_data: { source: p.source, source_id: p.source_id, title: p.title },
      latency_ms: 320 + ((i * 47) % 800),
      model_used: null,
      ts: new Date(now - (60 - i) * 60_000).toISOString(),
    });
  });

  // 20 ranker entries
  subset.forEach((p, i) => {
    rows.push({
      agent_name: 'ranker',
      event_type: i % 4 === 0 ? 'model_route' : 'rationale_generate',
      event_data: {
        source_id: p.source_id,
        score: p.score,
        nearest_branch_id: p.nearest_branch_id,
        warm: p.warm_for_customer_id,
      },
      latency_ms: 1200 + ((i * 113) % 2400),
      model_used: i % 4 === 0 ? 'haiku-3.5' : 'sonnet-4.5',
      ts: new Date(now - (40 - i) * 60_000).toISOString(),
    });
  });

  // 20 adjacent entries
  const targets = [
    'BlueLine Restoration', 'PerimeterPro Services', 'Apex Site Solutions',
    'Cascade Mobile Security', 'Sentry West Trades', 'Northstar Modular',
    'GraniteEdge Specialty', 'BorderRun Logistics', 'Anchor Field Services',
    'IronPath Restoration',
  ];
  for (let i = 0; i < 20; i++) {
    rows.push({
      agent_name: 'adjacent',
      event_type: i === 0 ? 'ingest_start' : 'source_fetch',
      event_data: {
        candidate: targets[i % targets.length],
        signal: i % 3 === 0 ? 'multi-branch-listing' : 'specialty-trade-press',
      },
      latency_ms: 850 + ((i * 31) % 1500),
      model_used: 'sonnet-4.5',
      ts: new Date(now - (20 - i) * 90_000).toISOString(),
    });
  }

  const { error, count } = await supabase
    .from('agent_log')
    .insert(rows, { count: 'exact' });
  if (error) throw error;
  return count ?? rows.length;
}

type AgentRunInsert = Omit<AgentRun, 'id'>;

async function writeAgentRuns(): Promise<number> {
  const now = Date.now();
  const rows: AgentRunInsert[] = [
    {
      agent_name: 'ingestor',
      started_at: new Date(now - 90 * 60_000).toISOString(),
      completed_at: new Date(now - 78 * 60_000).toISOString(),
      records_processed: 47,
      records_new: 12,
      status: 'success',
      error_message: null,
    },
    {
      agent_name: 'ranker',
      started_at: new Date(now - 45 * 60_000).toISOString(),
      completed_at: new Date(now - 41 * 60_000).toISOString(),
      records_processed: 29,
      records_new: 29,
      status: 'success',
      error_message: null,
    },
    {
      agent_name: 'adjacent',
      started_at: new Date(now - 6 * 3_600_000).toISOString(),
      completed_at: new Date(now - 5.5 * 3_600_000).toISOString(),
      records_processed: 18,
      records_new: 4,
      status: 'success',
      error_message: null,
    },
  ];

  // Idempotent: delete recent runs (last 7 days) for these agents, then insert.
  for (const r of rows) {
    await supabase
      .from('agent_runs')
      .delete()
      .eq('agent_name', r.agent_name)
      .gte('started_at', new Date(now - 7 * 24 * 3_600_000).toISOString());
  }
  const { error, count } = await supabase
    .from('agent_runs')
    .insert(rows, { count: 'exact' });
  if (error) throw error;
  return count ?? rows.length;
}

async function main() {
  console.log('▸ loading branches + customers from Supabase');
  const { branches, customers } = await loadBranchesAndCustomers();
  console.log(`  ✓ ${branches.length} branches, ${customers.length} customers`);

  console.log(`▸ scoring ${SEED_PROJECTS.length} synthetic projects via lib/scoring.ts`);
  const scored = SEED_PROJECTS.map((s) => score(s, branches, customers));
  const warmCount = scored.filter((s) => s.warm_for_customer_id).length;
  console.log(`  ✓ ${scored.length} scored · ${warmCount} with warm-intro signal`);

  console.log('▸ upserting projects (onConflict: source,source_id)');
  const projectsCount = await upsertProjects(scored);
  console.log(`  ✓ pathfinder.projects: ${projectsCount} rows upserted`);

  console.log('▸ writing agent_log rows');
  const logCount = await writeAgentLogs(scored);
  console.log(`  ✓ pathfinder.agent_log: ${logCount} rows inserted`);

  console.log('▸ writing agent_runs rows');
  const runCount = await writeAgentRuns();
  console.log(`  ✓ pathfinder.agent_runs: ${runCount} rows inserted`);

  // Final tallies for the run summary.
  const { count: pCount } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true });
  const { count: lCount } = await supabase
    .from('agent_log')
    .select('*', { count: 'exact', head: true });
  const { count: rCount } = await supabase
    .from('agent_runs')
    .select('*', { count: 'exact', head: true });

  console.log('---');
  console.log(`pathfinder.projects total: ${pCount}`);
  console.log(`pathfinder.agent_log total: ${lCount}`);
  console.log(`pathfinder.agent_runs total: ${rCount}`);
  console.log('done.');
}

main().catch((e) => {
  console.error('backfill failed:', e);
  process.exit(1);
});
