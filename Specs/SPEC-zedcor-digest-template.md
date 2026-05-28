# SPEC — Zedcor Daily Digest · Email Template Application

Last updated: 2026-05-27
Parent spec: SPEC-zedcor-tier1-manual.md
Status: Approved for Claude Code build

## Source of truth

The canonical email template, sample data, and design notes live at:

```
/Users/kylekesterson/Documents/Claude/Unicron/Pathfinder Digest - Design/
  ├── Pathfinder Digest.template.html   ← canonical Handlebars template
  ├── Pathfinder Digest.html             ← rendered preview with sample data
  ├── sample-data.json                   ← expected JSON shape
  └── NOTES.md                           ← design judgment calls
```

Treat `Pathfinder Digest.template.html` as immutable. Do not modify its markup, copy, or styling. Copy it verbatim into the repo at `Pathfinder/lib/email/zedcor-digest-template.html`. Future updates happen in the design folder first, then re-copied.

## Template engine: Handlebars

The template uses Handlebars syntax including a custom `eq` helper for phase-tag conditional rendering (`{{#if (eq phase "closing-soon")}}`). Handlebars ships without `eq`, so it must be registered.

`Pathfinder/lib/email/handlebars-setup.ts`:

```ts
import Handlebars from 'handlebars';

Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);

export function renderDigest(templateString: string, data: object): string {
  const compiled = Handlebars.compile(templateString, { noEscape: false });
  return compiled(data);
}

export { Handlebars };
```

Add `handlebars` to `Pathfinder/package.json` dependencies.

## Data shape

The digest data builder must produce JSON matching `sample-data.json` exactly. Every variable is required. Defaults handle missing data.

```ts
type DigestData = {
  date_pretty: string;            // "Wednesday, 27 May 2026"
  date_short: string;             // "27 MAY 2026 · 06:00 CT"
  run_id: string;                 // zero-padded 3-digit, "042"
  edition_no: string;             // same as run_id by default
  new_leads_count: number;
  closing_soon_count: number;
  sources_polled_count: number;
  highest_score: number;
  highest_score_label: string;    // "<agency-short> · <scope-keyword>"
  notion_db_url: string;
  logo_url: string;
  leads: Lead[];
  leads_remaining_count: number;  // new_leads_count - leads.length
};

type Lead = {
  title: string;
  notion_url: string;
  phase: 'pre-bid' | 'open' | 'closing-soon' | 'awarded' | 'unknown';
  score: number;
  response_deadline_pretty: string;
  days_until_deadline: number | null;
  agency: string;
  city: string;
  county: string;       // include the word "County"
  state: 'TX' | 'LA' | 'OK' | 'AR';
  rationale: string;
  estimated_value_pretty: string | null;
};
```

## Variable computation rules

All time math in America/Chicago timezone.

- `date_pretty`: `"Wednesday, 27 May 2026"` format.
- `date_short`: `"27 MAY 2026 · 06:00 CT"`. Uppercase month abbreviation.
- `run_id`: `String(agent_runs.id).padStart(3, '0')`.
- `edition_no`: same as `run_id` for now. When cron resumes and a digest sends independent of a manual run, use `pathfinder.organizations.config->>'digest_edition_counter'` and increment.
- `new_leads_count`: count of Notion DB rows where `Ingested At >= start-of-today` AND `Phase != awarded` AND `Rep Status != not-relevant`.
- `closing_soon_count`: count of Notion rows where `Response Deadline` is within next 7 days.
- `sources_polled_count`: count of distinct sources from the most recent successful orchestrator run's `agent_log` `source_hit` events.
- `highest_score`: max Score among rendered leads.
- `highest_score_label`: `"<agency-short> · <scope-keyword>"`. Examples: `"Port Houston · perimeter"`, `"TxDOT · lay-down yards"`. Derive from top lead's Agency (first 2-3 words, drop "Authority"/"Department"/"District" suffixes) + first scope keyword matched in Title from: `[perimeter, fence, surveillance, security, towers, lay-down, jobsite, demolition]`. If no keyword matches, use `"<agency-short> · top match"`.
- `notion_db_url`: `https://www.notion.so/856b43a02b4d43649344c5e1a05d206d` (link to the DB root; Notion routes user to default view).
- `logo_url`: read from env `DIGEST_LOGO_URL`.
- `leads`: capped at 10 by default (env `DIGEST_MAX_CARDS`). Sorted by Score desc, Response Deadline asc. Filter: `Phase != awarded` AND `Rep Status != not-relevant`. Each lead's Score must be non-null (rows with null Score are excluded from the digest — they appear in the Notion DB but not in the email).
- `leads_remaining_count`: `new_leads_count - leads.length`. If `<= 0`, set to 0. The template's "more in feed" eyebrow may need an `{{#if leads_remaining_count}}` guard for the 0 case — see "Template patches" below.

## Field mapping: Notion row → Lead object

| Lead field | Notion property | Transformation |
|---|---|---|
| title | Title | trim |
| notion_url | (page URL) | constructed from Notion page ID |
| phase | Phase | exact lowercase string |
| score | Score | integer; exclude row if null |
| response_deadline_pretty | Response Deadline | `"4 Jun"` (same year) or `"4 Jun 2027"` (future year). For phase=pre-bid: `"Pre-bid 10 Jun"` |
| days_until_deadline | Response Deadline | `Math.ceil((deadline - now) / 86400000)`. For phase=pre-bid: `null` |
| agency | Agency | as-is |
| city | City | as-is |
| county | County | append " County" if not already present |
| state | State | 2-letter code |
| rationale | Rationale | trim to first 220 chars + "..." if longer |
| estimated_value_pretty | Estimated Value | `"$510,000"` with commas, no decimals; `null` if Notion value is null |

## API surfaces

### `POST /api/zedcor/send-digest`

Request body: `{ recipients?: string[] }`. Default recipients: `['team@unicron.systems']`.

Behavior:

1. Pull latest successful run ID from `pathfinder.agent_runs`.
2. Call `buildDigestData(latestRunId, recipients)`.
3. Read template from `lib/email/zedcor-digest-template.html`.
4. `renderDigest(templateString, digestData)` → HTML string.
5. Send via Resend:
   - From: `RESEND_FROM_ADDRESS` (e.g., `Pathfinder <pathfinder@unicron.systems>`)
   - To: recipients
   - Subject: rendered through Handlebars: `"Pathfinder Houston — {{new_leads_count}} new opportunities · {{date_pretty_short}}"` where `date_pretty_short` is `"27 May"` format
   - HTML: rendered digest
   - Text: plain-text fallback (title + score + agency + deadline per lead, separated by blank lines)
   - Tags: `{ product: 'pathfinder', tenant: 'zedcor', edition: edition_no }`
6. Log `digest_sent` to `pathfinder.agent_log` with `event_data={ resend_message_id, recipients, lead_count, leads_remaining_count, run_id, edition_no }`.
7. Return JSON: `{ resend_message_id, lead_count, recipients }`.

### `GET /api/zedcor/digest-preview`

Returns the rendered HTML with current Notion data. No email send. Kyle opens this URL in a browser to verify the digest visually before clicking Send Digest. Protected by the same Supabase auth as `/internal` routes.

## Logo hosting

Resolve `DIGEST_LOGO_URL` in this order:

1. If `assets.unicron.systems` is already serving a 32×32 white Unicron mark, set env to that URL.
2. Otherwise: copy `/Users/kylekesterson/Documents/Claude/Unicron/Atrium-design/atrium-logo.png` to `Pathfinder/public/brand/atrium-mark-32-white.png`. Resize to 32×32 white-on-transparent if needed (sharp or imagemagick). Set env to `https://pathfinder-ashy.vercel.app/brand/atrium-mark-32-white.png` in production, equivalent preview URL in preview.

The smoke test must `curl` the resolved URL and confirm 200 + content-type image.

## Template patches

If the template's `{{leads_remaining_count}}` rendering looks awkward when the value is 0 (e.g., "0 more in feed"), do NOT edit the canonical template file. Instead:

1. Create `Pathfinder/lib/email/zedcor-digest-template.guarded.html` as a copy with an `{{#if leads_remaining_count}}...{{/if}}` guard wrapping the "more in feed" eyebrow + CTA section.
2. Document the patch in `Pathfinder/lib/email/TEMPLATE-PATCHES.md` with a diff and rationale.
3. Use the guarded template in `send-digest` and `digest-preview`.

The canonical file in `Pathfinder Digest - Design/` stays untouched so the design folder remains the source of truth.

## Smoke test additions

Append to the Sprint Z1 Phase 10 smoke test:

1. Open `/api/zedcor/digest-preview` in browser. Confirm:
   - Navy header band with gold underline, brand mark, three meta cells render correctly.
   - Cream stats strip shows three columns (or stacks on mobile under 600px).
   - At least 2 lead cards render with phase tag pill, `Score · Closes X · N days · County, State` meta, agency, italic Newsreader rationale, estimated value or em-dash.
   - CTA section shows "leads remaining" eyebrow and the dark navy pill button.
   - Footer shows mono uppercase line with gold dot.
2. Render-test in 4 email clients: Gmail web, Outlook 2019 (or Outlook M365 with Word engine), Apple Mail iOS, Outlook mobile. Capture screenshots. Outlook 2019 falls back to Georgia per MSO conditional — that's expected.
3. Click Send Digest with `team@unicron.systems`. Confirm receipt. Capture Resend message ID.

## Verbatim evidence

PR description must include:

- Screenshot of rendered digest in Gmail web
- Screenshot of rendered digest on iOS Apple Mail
- Resend message ID from test send
- Diff (or "no diff") between `Pathfinder/lib/email/zedcor-digest-template.html` and the canonical source
- If `TEMPLATE-PATCHES.md` was created, the patch diff
