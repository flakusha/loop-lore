## P6 — Post-0.1.0 Systems (RPG, Memory, Agentic — deferred, non-blocking for 0.1.0)

> All gaps below are **P6+ deferred** under the 2026-08-05 0.1.0 alignment
> (matrix § 0.1.0 Alignment). None block P0–P5 / 0.1.0. G12–G17 are RESOLVED
> (excluded). G21–G23 are 0.1.0 Quick Wins (excluded). **G38–G40 pulled forward
> to 0.1.0 Quick Wins 2026-08-15** (matrix agentic addendum rates them
> "Quick win (0.1.0)") — see § 0.1.0 Quick Wins items 13–14. The two agentic
> TASK tickets formerly flagged "needs ticket" now exist:
> `TASK-character-internal-traits.md` + `TASK-memory-happiness-patterns.md` (created 2026-08-15).

| Wave | Topic | Gaps | Epic / Ticket | Status | Depends on |
| ---- | ----- | ---- | ------------- | ------ | ---------- |
| P6-0 | Resolution layer + Memory cross-system | G5, G24, G25, G26 | `epic-resolution-system.md` ⬜ (Integration Points ✅ 2026-08-15); G24 → `TASK-memory-emotion-impact` ✅; G25 → `TASK-memory-timescape` ✅; G26 → `TASK-timeline-id-world-timeline-events` + `TASK-timeline-memory-injection` ✅ | ⬜ Not Started | foundational |
| P6-A | Battle hub integration | G1 Items, G2 Social, G3 NPC/Actor, G4 Weather | `epic-battle-integration-gaps.md` ⬜ — doc-level RESOLVED 2026-08-15 (Battle Integration Points cover all 4; runtime wiring remains) | ⬜ runtime | P6-0 |
| P6-B | NSFW cross-links | G6 Housing, G7 Weather, G8 Social, G9 Disease | `epic-nsfw-integration-gaps.md` ⬜ — doc-level RESOLVED 2026-08-15 (NSFW Integration Points cover all 4; runtime wiring remains) | ⬜ runtime | P6-0 |
| P6-C | Remaining RPG gaps | G10 Housing↔Companion, G11 Crafting↔Magic | `epic-housing.md` / `epic-crafting-professions.md` — G10 doc-resolved 2026-08-15 (Companion covers Housing); G11 doc-resolved 2026-08-15 (Crafting deps incl. Magic + `magic.enchantment_applied` event — cross-system enchanting) | ⬜ runtime | P6-0 |
| P6-D | Character / Agentic core | G27,G28,G29,G30,G31,G32,G33,G34,G35,G36,G37 | `TASK-npc-bdi-planning`, `TASK-character-mood-happiness`, `TASK-npc-to-npc-social`, `TASK-character-relationships`, `TASK-memory-emotion-impact`, `TASK-agent-memory-scoring`, `TASK-living-world-persistence`, `TASK-character-voice-profile`, `TASK-character-growth-development`, `TASK-character-internal-traits` (new 2026-08-15), `TASK-memory-happiness-patterns` (new 2026-08-15) | ⬜ | P6-0 + char epics |
| P6-E | Agentic features addendum | G41 InnerMonologue, G42 Tool-Calling↔All (G38–G40 promoted to 0.1.0 Quick Wins 2026-08-15) | `TASK-inner-monologue`, `TASK-tool-calling-agents` (all ✅); G42 last (broadest) | ⬜ | P6-D + memory/assistant |
| P6-H | Pre-Compiled Hot Binary Modules | (standalone infra — matrix § Pre-Compiled Hot Binary Modules Integration) | `epic-precompiled-hot-binaries.md` ⬜ + `TASK-precompiled-hot-binaries.md` ✅ — ModuleManifest contract, `binary.loaded`/`binary.fallback` events; added to backlog 2026-08-15 (was untracked) | ⬜ Not Started | foundational |
| P6-F | Emergent cross-cutting (candidates 13–15) | G18 Agentic-NPC autonomy, G19 Agent-memory scoring, G20 Living-world persistence | fold into actor/npc + memory + world epics (no new epic) | ⬜ | P6-D / P6-0 |
| P6-G | Integration-template standardization | (rec #4) all 17 RPG epics use standardized `## Integration Points` template | — | ✅ 17/17 full-template 2026-08-15 (magic, companion, disease, social, weather, exploration, economy, stealth-crime, faction-reputation converted from bullet-style; charcore added — was missing) | any P6 wave |

**P6 sequencing rationale (severity → ROI):**
- 🔴 High first: G5 Resolution (foundational dice layer) + G1–G4 Battle hub (matrix rec #1, touches most systems) + G42 Tool-Calling (broadest, sequence last in P6-E once subsystems expose tool schemas).
- 🟡 Medium: P6-B NSFW cross-links, P6-C, P6-D character/agentic, P6-F emergent.
- 🟠 Low: G35 Voice↔Growth, G41 InnerMonologue.
- **Pulled to 0.1.0 (2026-08-15):** G38 Proactive↔Memory, G39 Proactive↔TimeScale, G40 Keyphrase↔Chat — matrix agentic addendum rated them "Quick win (0.1.0)"; all three tickets exist (`TASK-proactive-messaging`, `TASK-quiet-hours`, `TASK-keyphrase-recall`).
- G18–G20 (candidates 13–15) fold into existing actor/npc/memory/world epics — no new epic per `epic-platform-research.md` Open Q5.

