<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: epic-linkage infrastructure: title-slug lookup table + multi-epic owner-picking rule

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Tags:** epic-linkage, infrastructure, plan-hygiene

**Summary:**

224 index entries in `index.json` carry a single `**Epic:**` value that contains embedded separators — the index only records the first epic, so these tickets are linked to the wrong epic or no epic at all. The prior scoping estimate was ~115 ticket files / ~99 index entries; the measured figure supersedes that. Prior repair passes (commits `cb13e6464` and `41209f0f6`) fixed some, but the root infrastructure is still missing. The defect was deliberately not fixed because two pieces of infrastructure do not exist: (a) no owner-picking rule for when a ticket names two real epics, and (b) no title-to-slug lookup table for legacy epic titles embedded in epic fields.

## Quantified sub-classes (measured, 2026-10-08)

Measured by scanning all 3331 `index.json` entries for epic field patterns:

| Separator | Example | Count |
|-----------|---------|-------|
| comma | `epic-assistant-gm-flows, epic-output-control-transforms` | 39 |
| slash | `epic-emotion-avatar-message-binding / epic-character-core-system` | 26 |
| semicolon | `Visual Novel Mode; Immersion & Presentation` | 6 |
| freeform prose | `Epic 26 (Avatar & Expression)`, `Character Core System`, `AO NSFW Game Mechanics` | 158 |

**Total multi-value/embedded epic entries: 224 unique index entries.** Categories sum to 229 because 5 entries contain both a comma and a slash (e.g. `epic-agency-story-points, NPC/Actor System`); those 5 are counted in both the comma and slash columns.

Of the 39 comma-separated entries, 24 have at least one slug that does not resolve to an existing `.plan/epics/*.md` file. The 158 freeform entries are the largest class — these contain prose titles rather than slugs and require a title-to-slug lookup table to resolve.

## Precedent (already fixed)

- `TASK-SEARCH-SERVICE-UNIFIED`
- `TASK-SEARCH-ENCRYPTED-BACKFILL`
- `TASK-SEARCH-TELEMETRY-OBSERVABILITY`
- `TASK-CHAT-CONTEXT-PREFERENCE-PER-SCOPE`

## Options

**Option A (recommended):** Build the title-to-slug lookup table as a generated artifact and add an owner-picking rule (first-existing-epic wins). Apply to all remaining entries in one pass.

**Option B:** Manual triage of each of the 224 entries. High noise, not recommended.

**Option C:** Mark all 224 as `Wontfix`. Not recommended — index continues to reflect wrong ownership.

## Evidence

- Commits `cb13e6464` and `41209f0f6` — prior repair passes that fixed some comma-separated entries.
- 319 epic files exist in `.plan/epics/`.
- Entries with multi-value epics include `BUG-ASSISTANT-IMPROVE-TRANSLATE-REWRITE-NEVER-CALL-LLM`, `BUG-CHAT-PERSIST-INIT-HARDCODED-SCENE`, `BUG-CHAT-PROMPT-OVERRIDE-BYPASS-ON-REPLY`, `BUG-CHAT-TRANSITIONS-MEMORY-POISONING`, `BUG-CHECK-DUPLICATE-LOADS-ALL-OWNER-ROWS`, `BUG-CLASSIFY-INTENT-CONFIDENCE-UNBOUNDED`, `BUG-GROUP-CASCADE-MAX-TURNS-OFF-BY-ONE`, `BUG-GROUP-CHAT-MENTION-PREFIX-COLLISION`, `BUG-PLUGIN-TOOL-GATING-EMPTY-ROLE-BYPASS`, `BUG-TOOL-CALL-ARG-PARSE-SILENT-FALLBACK`, `BUG-TOOL-CALL-RESULT-NO-FRONTEND-RENDERING`, `BUG-EMOTION-AVATAR-FALLBACK-METADATA-INCOMPLETE` (slash).
- Freeform entries (158 total) include prose titles: `Epic 26 (Avatar & Expression)`, `Character Core System`, `AO NSFW Game Mechanics`, `Battle & Action Systems`, `Wardrobe / Loadout Avatar Variants`, `Authentication Channel Provisioning`, `Avatar Alpha Channel + VN Layering`, etc.
- Related tickets: `TASK-index-epic-values-point-to-nonexistent-epic-files-7-bare-slu` covers the 7 bare slugs that don't resolve at all.

**Context:**

`TASK-BACKLOG-UNTRIAGED-ADVISORY-ORPHAN-SWEEP-2026-09-25` (c7448b3) covered closing orphans and backfilling metadata — it did not build the lookup table or owner-picking infrastructure.

**Acceptance Criteria:**

- [ ] Title-to-slug lookup table generated from existing epic filenames and titles
- [ ] Owner-picking rule codified (e.g., first-existing-epic wins, with optional override field)
- [ ] All 224 remaining multi-value epic entries resolved to a single canonical epic slug
- [ ] `epics-index.md` regenerated; `index.json` epic field consistent with resolved value
- [ ] No spurious diff in `index.json` on next `plan:sync:fix` run
