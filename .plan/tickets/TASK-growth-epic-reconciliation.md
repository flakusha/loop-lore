<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: growth-epic-reconciliation

**Status:** Done

**Priority:** high
**Effort:** Medium
**Epic:** epic-character-growth

**Summary:**

Reconcile growth epic Not Started status vs shipped code: growth_log and character_arc tables, growth-service, skills/traits/relationships bridges, and actorGrowthSection prompt section all exist in src. Update epic-character-growth Current State plus task table statuses to match verified code state.

**Context:**

Epic task table (§300-313) was stale: every row read Not Started while the code audit (2026-10-08) showed schema/service/bridges/prompt shipped. Verification this round confirmed validator (`validateGrowthFields`), API routes (mounted in `v1/actors-surface.ts`), and actors-PUT growth writes also ship — the only genuine gaps were last-mile wiring: `ActorUpdateBody` never declared `growthMode`/`llmAssistEnabled`, the editor `saveMode` never sent CHAR-1 `dataVersion`, and the two `src/views/partials/character-growth-*.html` templates were orphaned (served partial roots are `src/partials/` + `src/components/`, and neither the edit form nor the modal referenced them). Per the assignment, LLM-assist aux pass (Low) and journey export (O2) stay deferred, and `character.grew` stays unwired (no subscribers — emitting dead-code events would violate the acceptance criteria).

**Change:**

- `src/validation/schemas/actors.ts` — declared `growthMode` (dynamic|static) + `llmAssistEnabled` on `ActorUpdateBody`.
- `src/frontend/character-growth-editor.ts` (+ test) — `saveMode` sends CHAR-1 `dataVersion` and refreshes it from the PUT response.
- `src/routes/views/character-growth-section.ts` (new, 80L) — server-rendered Growth & Arc section seeded from the actors row + `character_arc`; mounted in `character-edit-form.ts`; `characters.ts` queries the arc row.
- `src/partials/characters/detail-modal.html` + `src/frontend/pages/characters-journey.ts` (new, 63L) — modal journey slot rendering arc stage + last 3 applied entries (player-safe: no pending/internal drift detail).
- Epic task table reconciled with file:line evidence; only llm-assist stays Open.
- `src/views/partials/character-growth-editor.html` + `character-journey.html` remain as reference templates (unreferenced); the live surfaces are the server-rendered section + modal slot above.

**Acceptance Criteria:**

- [x] Implementation complete
- [ ] Tests passing (orchestrator verifies at phase end — gates skipped per assignment)
- [x] Documentation updated
