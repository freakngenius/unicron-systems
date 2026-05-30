# After-state evidence — Contact Cleanup (2026-05-29)

## 1. Survivors query (acceptance criterion 3)

After `pnpm tsx scripts/cleanup-z14-1-layer3-catchalls.ts --execute --rerun-z7`,
re-running the predicate as a dry-run reports zero rejections — every
Layer-3 email still in the DB is one the shipped predicate accepts.

```
$ pnpm tsx scripts/cleanup-z14-1-layer3-catchalls.ts
Layer-3 Zedcor rows: 71
  to NULL (predicate rejects): 0
  keep (predicate accepts):    53
  already null:                18
(dry-run) pass --execute to apply NULLs
```

SQL counterpart:

```sql
SELECT
  COUNT(*) AS total_layer3,
  COUNT(*) FILTER (WHERE gc_metadata->>'gc_contact_email' IS NOT NULL) AS with_email,
  COUNT(*) FILTER (WHERE gc_metadata->>'gc_contact_email' IS NULL) AS null_email
FROM pathfinder.projects
WHERE organization_id = '6cd87740-7c72-4337-ac79-316a54242eef'
  AND gc_metadata->>'contact_resolution_layer' = '3';
-- total_layer3=71, with_email=53, null_email=18
```

## 2. Class-B preservation (acceptance criterion 4)

Spec-named Class-B legit-corporate catchalls — same counts before and
after; the only drop is the Class-A count.

| email                                       | rows (before) | rows (after) |
|---------------------------------------------|---------------|--------------|
| contact@brasfield.com                       | 4             | 4            |
| contact@caddell.com                         | 4             | 4            |
| contact@clarkconstructiongroup.com          | 4             | 4            |
| contact@consigli.com                        | 3             | 3            |
| contact@henselphelpsconstruction.com        | 6             | 6            |
| contact@jedunnconstruction.com              | 2             | 2            |
| contact@kiewit.com                          | 1             | 1            |
| contact@whiting-turner.com                  | 1             | 1            |
| **total Class-B (spec-named)**              | **25**        | **25**       |

Layer-3 with-email total dropped from 69 → 53 = 16 NULL'd rows, exactly
matching the Class-A count. No Class-B row was incorrectly NULL'd.

## 3. Re-run regeneration (acceptance criterion 5)

```
rerun summary: regenerated=0 stillNull=16 predicateRejected=0
```

All 16 cleared rows remained NULL on Z7 Layer 3 re-run — the extended
predicate held inside guessContactEmail (rejected every candidate at
generation time), so the script never had to apply the post-filter
secondary check. No Class-A email was regenerated.

## 4. By-reason rejection histogram

```
by_reason: {
  "generic_local_with_noncom_tld":     6,
  "generic_local_with_digit_in_domain": 1,
  "generic_local_with_short_domain":    8,
  "generic_local_for_joint_venture":    1
}
```

## 5. Per-row cleanup audit

Each NULL'd row carries a `gc_metadata.z14_1_cleanup` marker recording
the cleared email, reason, and timestamp. Where a prior partial cleanup
(2026-05-29T02:15:00Z) existed, the previous marker is preserved under
`z14_1_cleanup.previous` so the audit trail stays intact across cleanup
passes:

| gc_name                                                     | prev cleared                | now cleared                  | reason                                |
|-------------------------------------------------------------|-----------------------------|------------------------------|---------------------------------------|
| A3 TECHNOLOGY INC                                            | —                           | contact@a3technology.com     | generic_local_with_digit_in_domain    |
| AMERICAN INTERNATIONAL CONTRACTORS (SPECIAL PROJECTS) INC.   | —                           | contact@american.net         | generic_local_with_noncom_tld         |
| BCCG A JOINT VENTURE                                         | contact@bccga.com           | info@bccga.com               | generic_local_with_short_domain       |
| BIG-D CONSTRUCTION CORP                                      | contact@big-d.com           | info@big-d.com               | generic_local_with_short_domain       |
| CDM CONSTRUCTORS INC                                         | contact@cdm.com             | info@cdm.com                 | generic_local_with_short_domain       |
| FISHER SAND & GRAVEL CO                                      | —                           | contact@fisher.net           | generic_local_with_noncom_tld         |
| HEALTHEON, INC                                               | —                           | contact@healtheon.co         | generic_local_with_noncom_tld         |
| HURLEY JV, LLP                                               | —                           | contact@hurley.com           | generic_local_for_joint_venture       |
| MIRACLE SYSTEMS LLC                                          | —                           | contact@miraclesystems.net   | generic_local_with_noncom_tld         |
| OPR LLC                                                      | contact@opr.com             | info@opr.com                 | generic_local_with_short_domain       |
| RECORD STEEL AND CONSTRUCTION, INC.                          | —                           | contact@record.co            | generic_local_with_noncom_tld         |
| SLSCO, LTD.                                                  | contact@slsco.com           | info@slsco.com               | generic_local_with_short_domain       |
| THE ROBINS & MORTON GROUP                                    | —                           | contact@therobins.net        | generic_local_with_noncom_tld         |
| WALSH FEDERAL LLC (×2)                                       | contact@walsh.net           | info@walsh.net               | generic_local_with_short_domain       |
| WALSH PUERTO RICO, LLC                                       | contact@walsh.net           | info@walsh.net               | generic_local_with_short_domain       |

`gc_name`, `contact_resolution_layer`, and `extraction_layer` preserved
on every cleared row per spec ("Keep `gc_name`. Keep
`contact_resolution_layer` so re-run knows to retry").

## 6. Reversibility

The before-snapshot at
`Pathfinder/scripts/_evidence/contact-cleanup-layer3/before-snapshot.json`
captures every Layer-3 row's pre-cleanup state. Auto-revert is a single
UPDATE per id reading email back from the snapshot:

```sql
UPDATE pathfinder.projects p
SET gc_metadata = jsonb_set(
  jsonb_set(p.gc_metadata, '{gc_contact_email}', to_jsonb(s.email)),
  '{z14_1_cleanup}', 'null'::jsonb
)
FROM (... before-snapshot json loaded into a CTE ...) s
WHERE p.id = s.id;
```
