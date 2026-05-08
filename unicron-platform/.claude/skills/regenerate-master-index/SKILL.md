---
name: regenerate-master-index
description: Regenerate the vault master index — rebuilds _master-index.md from current vault directory
domain: memory
type: scheduled
inputs: []
outputs:
  - type: vault_doc
    location: wiki/_master-index.md
schedule_cron: "TZ=America/Los_Angeles 0 22 * * 0"
refusal_gate: no
budget_usd_per_run: 0.08
---

# regenerate-master-index

Regenerate `_master-index.md` in the knowledge vault by walking the current vault directory structure and rebuilding the index from scratch. Runs weekly on Sundays at 22:00 PT.

## Execution

1. List all `.md` files in the `freakngenius/unicron-knowledge` repository recursively.
2. Parse the frontmatter of each file to extract: `title`, `created_at`, `domain`, `tags`.
3. Group files by directory / domain.
4. Generate `_master-index.md` with:
   - Table of contents (directory tree)
   - Per-domain section with file list, description, and last-modified date
   - Stats summary: total docs, total domains, newest doc, oldest doc
5. Commit `_master-index.md` to main branch with message: `chore(vault): regenerate master index YYYY-MM-DD`.

## Output format

```markdown
# Vault Master Index

Last regenerated: YYYY-MM-DD HH:MM PT
Total documents: N
Domains: N

## Table of Contents
- wiki/memory/ (N docs)
- wiki/retros/ (N docs)
- wiki/memory/analyst/ (N docs)
...

## Memory
| File | Description | Last Modified |
|------|-------------|---------------|
| analyst/YYYY-MM-DD.md | Daily digest | YYYY-MM-DD |
...
```

## Notes

- Cost ceiling: $0.08/run. File listing is API-intensive; batch GitHub tree calls.
- Run after `vault-lint` to catch broken links before indexing.
- No refusal gate — this is a maintenance operation.
