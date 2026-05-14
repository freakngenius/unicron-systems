# SPEC — Atrium Money / Accounts Tab

The Atrium Money tab's Accounts view reads from the Notion Accounts database and displays it grouped by paid vs free/trial.

## Source

Notion database: **Accounts**
- URL: https://www.notion.so/futuroso/350785c67e728039b4eee158a72bf35c?v=350785c67e72801c9b90000cbc1186e7
- Database ID: `350785c6-7e72-8039-b4ee-e158a72bf35c`
- Data source / collection: `350785c6-7e72-80ec-907d-000ba9f7322d`
- View: `350785c6-7e72-801c-9b90-000cbc1186e7`

The "ACCOUNTS" entry in Atrium's Money tab should deep-link to this Notion view.

## Confirmed DB schema (fetched 2026-05-14)

| Notion property | Type | Notes |
|---|---|---|
| Service | title | the account name |
| Status | select | Active / Canceled / Paused |
| Category | multi-select | AI / Communication / Infrastructure / Integration / Pathfinder |
| Subscription | number (dollar) | the fee; empty/0 = not charging |
| Account Type | select | Monthly / Yearly / 1-time / API / Free |
| Last Billed | date | |
| Start Date | date | |
| Notes | text | |
| API, Email, PW, Username | text/email | CREDENTIALS — do NOT surface on Atrium |

## Column mismatch to resolve

Kyle's requested column list included **"Product"** — there is NO Product column in the Notion DB. Resolution: use `Category` in the Product slot (it carries the "Pathfinder" tag among others), OR drop Product from the Atrium display. **Recommended: rename the Atrium column header to "Category" and show the Category multi-select values.** If Kyle specifically wants a Pathfinder-vs-other split, derive it from whether Category includes "Pathfinder".

## What ships

Atrium Money tab → Accounts view displays the Notion Accounts data with these columns:

**Service · Status · Category · Subscription (fee) · Account Type · Last Billed · Start Date · Notes**

(Product replaced by Category per the mismatch resolution above. Credentials columns excluded.)

### Grouping

Two sections, in this order:

1. **Paid accounts** — rows where `Subscription` has a dollar amount > 0. Grouped at top. Sort within group by Subscription descending (biggest spend first) so the cost picture is immediately legible. Show a section subtotal of monthly + yearly spend.

2. **Free / Trial accounts** — rows where `Subscription` is empty/0 OR `Account Type` = "Free". Section below the paid group. These aren't charging.

### Display

- Use Atrium v3 light design tokens — white cards/rows on cool-gray, --v3-line dividers, --v3-ink text, mono for numeric/date columns.
- Status as a pale-pill: Active → green-soft, Paused → amber-soft, Canceled → red-soft.
- Category as soft-tint chips.
- Subscription formatted as currency.
- Last Billed / Start Date formatted as readable dates; mono.
- Top-of-section subtotal for the Paid group (sum of monthly-equivalent spend — for Yearly accounts, divide by 12 to normalize, OR show both raw and monthly-equivalent; pick the clearer one and note the choice).
- A header link/button: "Open in Notion →" deep-linking to the Accounts view URL above.

## Integration / auth

The Notion integration that Atrium uses (the "Metacron Kanban Read" integration or whichever Notion token is wired to unicron-platform) MUST have the Accounts database shared with it. If the Atrium Money tab returns a 401/404 on the Accounts query, the fix is: share the Accounts database with the integration in Notion (database → ... → Connections → add the integration). Add `NOTION_DB_ACCOUNTS = 350785c6-7e72-8039-b4ee-e158a72bf35c` to the unicron-platform Vercel env if a dedicated env var is the pattern (consistent with NOTION_DB_*_KANBAN vars already present).

## Acceptance criteria

- Atrium Money tab Accounts view renders real rows from the Notion Accounts DB.
- Paid accounts (Subscription > 0) grouped at top, sorted by spend descending, with a spend subtotal.
- Free/Trial accounts (Subscription empty/0 or Account Type = Free) in a section below.
- Columns shown: Service, Status, Category, Subscription, Account Type, Last Billed, Start Date, Notes.
- Credentials columns (API, Email, PW, Username) NEVER rendered.
- v3 light styling, status pills, category chips.
- "Open in Notion →" deep-link works.
- No 401/404 — integration has DB access.
- Empty state if the DB query returns nothing: honest "No accounts found" copy, not stub data.

## Out of scope

- Editing accounts from Atrium (read-only mirror of Notion).
- Real-time sync (fetch-on-load + Reload is sufficient).
- Surfacing credentials anywhere in Atrium.

End.
