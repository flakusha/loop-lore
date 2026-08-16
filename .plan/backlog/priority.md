# Priority — Workstack Index (P0–P6+)

> **Last updated:** 2026-08-16 (.plan housekeeping refresh — backlog aligned to implemented
> features, feature matrix items promoted into P4/P5/P6 tiers). Index of the priority
> ladder, split by priority/phasing into tier files (2026-08-15). Tier files hold the
> detail; this index holds the status header, file map, and milestone gates.
>
> **Since 2026-08-15 refresh:** Gate C core shipped + verified on `dev` (2026-08-12) —
> memory-selection UI + C1 participant panel + recovered-features merged to `dev`
> (2026-08-14); **lint-ts + e2e gates closed 2026-08-14** (`lint-ts-debt` +
> `e2e-stabilization` worktrees → `check` 18/18, browser e2e 19/19 ×2); **GM-guided
> story (P2-Da) done**; item-systems backend wiring 10/15 + docs-reconciliation merged
> 2026-08-14; **7 more RPG services wired 2026-08-14 (`51a7bc01`)** — achievements,
> skills, npc-navigation, replayability, world-location-traits, xp-loot, combat +
> quest-engine consolidation. **Release channels synced (`dev` pushed to `origin/dev`,
> `work` pushed to `origin/work`)**. **Feature matrix items promoted to P4/P5/P6 tiers**
> (2026-08-16) — conversation branching, lorebook activation, conversation analytics,
> model comparison, generation quality metrics, lore-consistency, model capability
> registry, token budget advisor, memory access audit, prompt library expansions.

## Status header

P0 ✅ · P1 ✅ · P1.5 ✅ · P2 🟡 in progress · Regex ✅ · P3–P5 → 0.1.0 value tiers
(§ P3–P5 below) · P6 → § P6 (below); finer debt → `../open.md` · Gate C ✅ (GM-guided
story P2-Da done — merged to `dev`). **Feature matrix items promoted 2026-08-16.**

## File map (split 2026-08-15)

| File | Holds |
| ---- | ----- |
| [`priority-p0-p2.md`](./priority-p0-p2.md) | **P0–P2** — critical path, high priority, accessibility, core workstream (VN/chat/assistant/GM/auth/gallery/character/world) + tier details |
| [`priority-p3-p5.md`](./priority-p3-p5.md) | **P3–P5** — 0.1.0 core foundation value tiers, core experience, wiring/search/polish |
| [`priority-p6.md`](./priority-p6.md) | **P6+** — post-0.1.0 systems (RPG, Memory, Agentic — deferred, non-blocking), waves P6-0…P6-H, sequencing rationale |
| [`priority-release-010.md`](./priority-release-010.md) | **Post-P3 → 0.1.0** — road to happy 0.1.0, release artifacts, hardening, 0.1.0 Quick Wins (emergent-platform analysis) |

`../open.md` holds in-flight/debt/unwired/deferred queues — see `../open.md` index.

## Milestone Gates

| Gate   | Trigger | Criteria                                                                                                       | Status |
| ------ | ------- | -------------------------------------------------------------------------------------------------------------- | ------ |
| Gate A | Post-P0 | Observability + testing stable; Data Integrity 1; NSFW moderation live; shared schemas enforced                | ✅     |
| Gate B | Post-P1 | Import/Export + Admin with encryption; NSFW + Battle integrations; Data Integrity 2; memory tiers + cross-chat | ✅     |
| Gate C | Post-P2 | VN wired; chat functional; assistant + tool calling; GM flows; GM-guided story; auth/access; gallery usable    | ✅ **All core ✅ + GM-guided story (P2-Da) done 2026-08-14** — Gate C complete |
| Gate D | Post-P3 | P3–P5 value tiers operational; P6+ non-blocking                                                                | ⬜     |
