# Pathfinder — Design Feedback: Liveness Pass

**Status:** v1 · **Date:** April 25, 2026 · **For:** Claude Design
**Pairs with:** Pathfinder-PRD.md, Pathfinder-Build-Brief-Claude-Code.md

---

## Frame

The structural design is strong — keep it. What's missing is the feeling that this is a live agentic system, not a static screen. The interface should look like a stream from the system, not a snapshot of it. Computer is the contest's named engine; the design needs to make Computer's continuous operation visibly central, not implied.

## Add (in priority order)

1. **Activity log strip.** Bottom drawer or right rail. Tail-f style monospaced stream of ingest, normalization, geocode, ranking, and cross-pollination events with timestamps. Auto-scrolls. Single biggest "Computer is working" signal — highest-leverage addition by a wide margin. Sample lines:

```
[04:00:12] usaspending → 18 new
[04:00:14] normalizing batch a3f2 · 18/18
[04:00:21] claude ranking PRJ-9F2A11 · 2.4s · score 87
[04:00:28] geocoded · 18/18 · branch-mapped HOU 12, ATL 4, PHX 2
[04:00:33] cross-pol check · 3 warm-intro candidates
```

2. **Pipeline strip.** Horizontal at the top showing the agent loop's stages: INGEST · NORMALIZE · GEOCODE · RANK · DELIVER. Each stage shows queue depth, in-flight count, and average latency. Converts the dashboard from "results view" to "system operations view." This is the contest hook visualized — judges see the loop, not just the output.

3. **Live time-since-ingest counter.** Replace static `LAST INGEST · 04:00:12 UTC` with `LAST INGEST · 12s ago` updating every second. Tiny detail, outsized "this is alive" effect.

4. **Pulsing LIVE dot.** ~1.2s slow pulse, low amplitude. Not a flash.

5. **Sonar-ping on new pin arrivals.** When a record lands on the map, pin appears with a brief expanding ring (~600ms) at its coordinates. Restrained but transmits real-time arrival.

6. **Score count-up on newly-ranked projects.** When a project newly enters the ranked list, the score badge animates from 0 to final value over ~600ms. Bloomberg ticker energy. Visually signals "Claude just decided this."

7. **Branch counts and top-bar stats tick on update.** When Houston's `28` becomes `29`, the number briefly highlights and ticks. Same for `247 NEW`, `3,402 TRACKED`, `71 RANKED`. Right now those numbers feel painted on; they should feel emitted by something.

8. **Streaming rationale on first modal open.** When a freshly-ranked project's modal opens for the first time, the Claude rationale text streams in character-by-character (~50 chars/sec), then settles. Subsequent opens render instant. Shows reasoning happening without narrating it.

## Do not add

- No background grid breathing, ambient motion, or scan lines. Keeps it ops-grade, not gamified.
- No "Claude is thinking…" copy or anthropomorphization. Show the work, don't narrate it.
- No flashes of color unless something errored. Errors earn attention; routine flow stays quiet.
- No play/pause demo control. The system runs because it's running.
- No more than one motion happening at the same time in any region. Pin pulse + score count-up + counter tick all firing on top of each other reads chaotic.

## Why this matters

The contest's named criterion is "Computer is the engine, not a helper." The current design shows the *output* of Computer's work. The eight moves above show Computer's work *happening*. That's the difference between a product demo and a system demo. Both judges and Kyle Doenz need to see the loop, not just the result.

Restraint over ornament throughout. Only one thing should be moving at a time in any region of the screen.
