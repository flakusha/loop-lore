<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Harness context priority tiers

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** `.plan/epics/epic-harness-integration.md`
**Tags:** harness, prompt, budget
**Summary:** `ContextTier` (`task | session | workTopic | project` → 0/1/2/3) as an ORTHOGONAL axis composed with the existing section `PRIORITY` map; tier ranks content by provenance, priority ranks sections within a prompt.
**Context:** Two axes, not one. Existing axis — `PRIORITY` (`src/assistant/prompt/types.ts:192-223`) ranks prompt SECTIONS within one prompt, 0 = protected, 5 = `examples` dropped first, unknown names default `?? 0` and are immune; enforced by `dropOverBudgetSections()` (`src/assistant/prompt-budget.ts:62`) which sorts ascending and drops from lowest upward while `priorityOf(s.name) > 0`. New axis — tier ranks CONTENT BY PROVENANCE: 0 `task` (current work item), 1 `session` (current session context), 2 `workTopic` (work-topic-scoped runs/notes/decisions), 3 `project` (repo-overall, always eligible for trim). Composed drop order is TIER FIRST, then section priority WITHIN the tier: a tier-3 priority-0 section still outranks a tier-2 priority-5 section. Memory injection has its own independent sub-budget in `selectWithinBudget()` (`src/memory/budget.ts:25`, `respectPins: true`, hardcoded `maxTokens: 1024` at `src/memory/provision.ts:82`) — tier ranks alongside pins, never replaces them.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] `ContextTier` is a union `task | session | workTopic | project` mapped to 0/1/2/3. Tier 0 is never dropped; tier 3 is dropped first.
- [ ] Tier is an ORTHOGONAL axis to `PRIORITY` (`src/assistant/prompt/types.ts:192-223`); effective drop order is tier-then-priority, so a tier-3 priority-0 section outranks a tier-2 priority-5 section.
- [ ] Enforcement composes INTO `dropOverBudgetSections()` (`src/assistant/prompt-budget.ts:62`) without changing its `priorityOf(s.name) > 0` droppable gate, and without changing the `?? 0` unknown-name default that makes unknown sections immune to dropping.
- [ ] `SectionBuilder` (`src/assistant/prompt/types.ts:183-188`) is NOT restructured. All 29 entries in `PROMPT_SECTIONS` (`src/assistant/prompt/registry.ts:40-83`) stay untouched — tier is DERIVED (from section name / provenance), not a new required builder field.
- [ ] Existing `prompt-budget.test.ts` contract passes UNMODIFIED; emission order (array order of `PROMPT_SECTIONS`), `reorderPromptMessages()` (`src/assistant/prompt-budget.ts:104`), `compactPromptHistory()` (`src/assistant/prompt-budget.ts:27`), and `ContextCompactor` (`src/generation/context-compactor.ts:57`) are unchanged.
- [ ] `selectWithinBudget()` (`src/memory/budget.ts:25`) gains a tier sub-tier ALONGSIDE the existing `respectPins` pin bypass: pins outrank tier 0 (a pinned tier-3 memory is kept over an unpinned tier-0 memory). The hardcoded `maxTokens: 1024` at `src/memory/provision.ts:82` becomes tier-aware.
- [ ] `MemoryScope` is NOT extended — it stays `character | assistant | world` (`src/memory/types.ts:15`, mirrored by `EntityScopeSchema` in `src/validation/schemas/entities.ts:15`, enforced by `checkScope()` at `src/memory/provision.ts:150`), because a 4th member would silently change chat provisioning and the world-scope permission checks in `src/actors/actor-memories.ts:120,187,259`. Work-topic scoping is a SEPARATE nullable FK dimension on the harness-side record only.
- [ ] Every injection records which tier won (kept vs. trimmed, and the tier), feeding the §7 dashboard and the §8 exec log.
- [ ] Unit tests cover cross-axis ordering (tier-3/priority-0 beats tier-2/priority-5), tier-0 protection, pin-over-tier-0 precedence, and the unchanged legacy contract. `bun run check` green.

## Related Files

- `src/assistant/prompt/types.ts:183-188,192-223`, `src/assistant/prompt/registry.ts:40-83`
- `src/assistant/prompt-budget.ts:27,62,104`, `src/generation/context-compactor.ts:57`
- `src/memory/budget.ts:25`, `src/memory/provision.ts:82,150`, `src/memory/types.ts:15`
- `src/validation/schemas/entities.ts:15`, `src/actors/actor-memories.ts:120,187,259`
- `.plan/epics/epic-harness-integration.md` (§7 dashboard, §8 exec log)
- `TASK-harness-work-topics`, `TASK-harness-topic-session-attach`

git issue: 1584986
