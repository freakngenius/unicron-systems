# Open Blockers

## 1. Notion integration needs page access — **user action required**

**Error:**
```
Could not find page with ID: 347785c6-7e72-8096-bd2d-caa75b5928d1.
Make sure the relevant pages and databases are shared with your
integration "Unicron Product Suite".
```

**What to do:**
1. Open Notion.
2. Navigate to the "Product" page under "Billion Dollar Build Command Center" (URL: `https://www.notion.so/347785c67e728096bd2dcaa75b5928d1`).
3. Click **•••** (top-right) → **Connections** → **Connect to**.
4. Search for and select **"Unicron Product Suite"**.
5. Re-run locally: `npm run notion:setup`.
   - That creates the 5 pattern databases under the Product page and caches their IDs in Supabase `notion_meta`.

**Impact while blocked:**
- Mycelium's `promote` flow (signals crossing threshold → Notion mirror) is a no-op that logs a warning.
- Beehive / Colony / Murmuration / Slime post-run Notion mirrors also no-op.
- All pattern UIs, APIs, and tests continue to work — Notion is a stretch surface, not load-bearing.

Once access is granted + setup is run, the Notion mirror paths activate automatically (they check `getNotionDbId(key)` at call-time).
