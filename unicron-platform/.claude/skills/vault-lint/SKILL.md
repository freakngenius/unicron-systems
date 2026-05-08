---
name: vault-lint
description: Lint the knowledge vault — check for broken links, missing frontmatter, orphan pages
domain: memory
type: scheduled
inputs: []
outputs:
  - type: vault_doc
    location: outputs/reports/wiki-lint-YYYY-WW.md
schedule_cron: "TZ=America/Los_Angeles 0 22 * * 0"
refusal_gate: no
budget_usd_per_run: 0.05
---

# vault-lint

Lint the knowledge vault for structural issues: broken internal links, missing required frontmatter fields, orphan pages (referenced nowhere), and oversized docs. Runs weekly on Sundays at 22:00 PT before `regenerate-master-index`.

## Execution

1. List all `.md` files in `freakngenius/unicron-knowledge` recursively.
2. For each file:
   a. Check frontmatter exists and has required fields: `name` or `title`, `created_at`.
   b. Extract all internal `[text](path)` links and verify each target file exists.
   c. Record the file as "referenced" if another file links to it.
3. After processing all files: collect files with no inbound links (orphans).
4. Compute ISO week number: `YYYY-WW`.
5. Write report to `outputs/reports/wiki-lint-YYYY-WW.md`.
6. If critical errors > 0: post a Slack alert to `#orchestrator-feed`.

## Output format

```markdown
# Vault Lint Report — YYYY-WW

Run at HH:MM PT.

## Summary
- Total files: N
- Broken links: N
- Missing frontmatter: N
- Orphan pages: N
- Critical errors: N

## Broken Links
- wiki/foo.md → references wiki/bar.md (NOT FOUND)

## Missing Frontmatter
- wiki/baz.md — missing: created_at

## Orphan Pages
- wiki/old-doc.md (no inbound links)
```

## Notes

- Cost ceiling: $0.05/run. No LLM calls needed — pure structural analysis.
- Run before `regenerate-master-index` so the index reflects a clean state.
- No refusal gate — this is a read-only audit.
