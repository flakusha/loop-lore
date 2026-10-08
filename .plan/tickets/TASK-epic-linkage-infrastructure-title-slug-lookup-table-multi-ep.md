<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: epic-linkage infrastructure: title-slug lookup table + multi-epic owner-picking rule

**Status:** In Progress
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

- [x] Title-to-slug lookup table generated from existing epic filenames and titles
- [x] Owner-picking rule codified (e.g., first-existing-epic wins, with optional override field)
- [ ] All 224 remaining multi-value epic entries resolved to a single canonical epic slug
- [ ] `epics-index.md` regenerated; `index.json` epic field consistent with resolved value
- [ ] No spurious diff in `index.json` on next `plan:sync:fix` run

## Progress (2026-10-08)

Landed (Option A, infra + first pass):

- `70883c05f` feat(tools): owner-picking rule + generated title table
  (`scripts/plan/epic-owner-pick.ts`, 13 `bun test`s, `epic-titles.generated.ts`
  with 282 H1 titles, `scripts/plan/README.md` section).
- `a2ec20016` fix(plan): 107 tickets collapsed to first-existing owner
  (`.md` headers + `index.json` + regenerated `feature-matrix.md`).
  Follow-up: whole-value exact title match (titles containing `/` split
  apart otherwise) collapsed 15 more (Wardrobe x8, Asset-Platform x7).
  Verified: index diff is 107 epic-value changes only (0 added/removed keys,
  key order unchanged, lowercase `BUG-redos-…` key unmoved); `bun run
  plan:validate` all 11 gates pass; `bun test scripts/plan/` 39 pass.

- Rule: first listed candidate naming an existing `.plan/epics/*.md` wins
  (bare slug or exact title-table hit). Entries where `.md` and index pick
  different owners are held back, never force-collapsed.

Reconciled denominator (measured at pre-work base `7929fb66a` and at HEAD,
same class definitions): 252 unresolvable epic values = 172 ticket-scope
(39 comma + 26 slash + 6 semicolon + 106 whitespace-prose − 5 comma/slash
both) + 80 single-token (`proposed:epic-x` ~41, dangling `epic-*` ~14,
`review-dev-*`, `(none)`, backticked keynav x6, misc). 122 collapsed + 130
remainder = 252 closes exactly (scope 172 − 122 = 50 remaining in-scope;
80 singles untouched, 80 → 80; canonical singletons 1555 → 1677, +122 =
collapsed count, zero unrelated index churn; keys 3331 → 3331, denominator
did not move during this work). The filed 224 = the 172-scope class only;
the 80 singles were never in scope. The filed freeform-158 exceeds measured
whitespace-prose-106 by 52 (net 80 − 52 = the 28-entry gap).

Remainder (130 entries held back, need product judgment):

- Numbered `Epic NNN` aliases with no resolvable file (12): `Epic 26
  (Avatar & Expression)` x4, `Epic 28 (Asset Support)` x2, `Epic 36 (Chat
  Lifecycle)` x4, `Epic 24/41`, `Epic 51`, `Epic Visual Novel Mode (51)`
  x2, `Epic Immersion & Presentation (sub-task)` x2, `Epic Battle & Action
  Systems` x2 —incl. TASK-3D-PERFORMANCE, TASK-3D-VIEW-MODES(+UI),
  TASK-CHAT-MESSAGE-SEARCH, TASK-CHAT-ROOM-FILTERS/SEARCH-JOIN,
  TASK-VN-SCENE-TEMPLATE-SYSTEM, TASK-VN-TEMPLATE-ACTIONS,
  TASK-TEXT-EFFECTS-OVERLAYS, TASK-VISUAL-NOVEL-MODE,
  TASK-BATTLE-ENCOUNTER-TEMPLATE-SYSTEM, TASK-BATTLE-TEMPLATE-ACTIONS.
- `NPC/Actor System` + prose-second-candidate (4): TASK-NPC-INVENTORY,
  TASK-NSFW-SOCIAL, TASK-NSFW-WEATHER,
  TASK-VN-EMOTION-MOOD-AND-ACTION-DRIVEN-SPRITE-STAGING.
  (Sibling entries where the FIRST candidate resolved were collapsed:
  TASK-NPC-BDI-PLANNING, TASK-NPC-BEHAVIOR/MEMORY/TO-NPC-SOCIAL,
  TASK-NSFW-DISEASE.)
- `Wardrobe / Loadout Avatar Variants` (8, now resolved — whole-value exact
  title match added to the rule after the first pass):
  TASK-DEFERRED-EQUIPPED-ITEMS-*, TASK-OUTFIT-SCOPED-*, TASK-SELECTION-*,
  TASK-STORY-GM-OUTFIT-*, TASK-WARDROBE-* (4) -> `epic-wardrobe-avatar-variants`.
- `Asset Platform Capabilities (Messenger/Social Patterns)` (7, now resolved
  the same way): TASK-ASSET-PLATFORM-B1..B5, TASK-DECISION-AV10/AV8 ->
  `epic-asset-platform-capabilities`.
- `Authentication Channel Provisioning` (10, near-miss of H1
  `Authentication Channel Provisioning — Messenger / E-mail / …`, exact
  match required): TASK-AUTH-FACTORS-*-F1, TASK-F2..F10, TASK-TOTP-*.
- `proposed:epic-x` placeholders (39, no epic file exists — 2 resolve to
  real files but are covered by sibling tickets, left for triage).
- Dangling single slugs / prose / review tags / template text (50):
  `epic-assets-*`, `epic-encryption-foundation`, `epic-memory-systems*`,
  `epic-notification-expansion`, `epic-asset-support-expansion`,
  `EPIC-2026-39`, `review-dev-2026-08-26-*`, this ticket's own quoted body
  text, TASK-TEMPLATE placeholder, etc.

Rerun: `bun run scripts/plan/epic-owner-pick.ts` (dry-run report) or with
`--apply`; `--gen` regenerates the title table.
