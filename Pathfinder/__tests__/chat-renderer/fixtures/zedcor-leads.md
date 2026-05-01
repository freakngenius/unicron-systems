## Top 8 leads near Calgary in the last 7 days

Here's what surfaced. The top three already have warm-customer hits, so they're the priority for outbound today.

| Project | Title | Score | Value | Stage | Branch | Distance |
|---|---|---|---|---|---|---|
| `prj_abc12390a` | Hyatt Place — North Hill expansion | 94 | $4.2M | RFP | YYC-N | 6.2 mi |
| `prj_b9f81ee04` | Calgary Public Library — Seton branch | 91 | $1.85M | PRE | YYC-S | 12.4 mi |
| `prj_4c2dd1a90` | Foothills Hospital — perimeter modernization | 88 | $12.4M | AWARDED | YYC-N | 4.1 mi |
| `prj_771fe9b21` | Aspen Glen Industrial Park — phase 2 | 84 | $620K | RFP | YYC-W | 18.0 mi |
| `prj_18ae930ce` | Mount Royal University — recreation centre | 82 | $2.3M | PRE | YYC-S | 9.8 mi |
| `prj_55ad12cee` | Stoney Trail interchange — security retrofit | 79 | $880K | RFP | YYC-N | 22.1 mi |
| `prj_e90442a01` | Telus Spark — exterior lighting + access | 76 | — | PRE | YYC-N | 7.4 mi |
| `prj_2bbd0fa18` | Calgary Co-op — distribution centre | 71 | $410K | DRAFT | YYC-W | 14.6 mi |

### Why these stand out

- **`prj_abc12390a`** *(Hyatt Place)* — GC is **Treasure Valley Build**, a warm contact for YYC-N. Perimeter cameras + access control are explicitly in scope; budget signal in the RFP attachment lines up with the $4.2M envelope.
- **`prj_b9f81ee04`** *(Seton library)* — public-data signal: city council pre-approved Q1 2026. Adjacent to two Zedcor-installed sites; relationship-mapper flagged it.
- **`prj_4c2dd1a90`** *(Foothills modernization)* — already AWARDED to a competing GC; pursue as a sub-bid to the security trade only.

### Suggested outreach

> Lead with the Hyatt project. Treasure Valley has answered three of the last four cold emails within 48 hours.

```ts
// the snippet ranker would use to compute the new ordering
const score = await rankProjects(projects, {
  weights: { value: 0.4, stage: 0.3, distance: 0.2, recency: 0.1 },
  maxRadius: 25,
});
```

Internal cost for this run: `$0.0214` across `5` model calls (`claude-haiku-4-5` + `sonar`).
