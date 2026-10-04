<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Enforce state-machine + composite validators at write time

**Status:** Not Started
**Priority:** medium
**Effort:** Medium (one helper + 6 service wire-ups + tests)
**Summary:** The validators added by `cc4b39ed4` (`feat(db): state-machine composite validators + write-path guards`) are defined and unit-tested but never consulted at runtime — write paths still use raw Kysely `insertInto`/`updateTable`. Add a single `assertValidWrite(table, row)` helper that picks the right `CompositeValidator` or `StateMachine`, and wire it into the 6 affected service entry points. No column changes.
**Context:** DB schema-gate audit (2026-09-25, `db-migration-fixes` session, scout report) flagged 6 validators that are defined but unenforced: `messagesStatusVisibility`, `loreDisputedInvariant`, `shadowNotesStatusVisibility`, `shareAlikeDerivatives`, `branchesDisplayInvariant`, `ItemInstanceState`. Each lives only in migration comments or in the validator module today. Adding `assertValid` to every write path is the missing backstop that closes the gap between "type-safe enum" and "actually enforced invariant".

## Validators and their write sites

| Validator | Where it must fire |
|---|---|
| `messagesStatusVisibility` (status × visibility) | `src/routes/messages/create.ts`, `src/routes/messages/rewrite.ts`, `src/chat/service/messages.ts` |
| `loreDisputedInvariant` (confidence × distortion → disputed) | `src/assistant/lore/lifecycle.ts`, `src/routes/lore/*.ts` |
| `shadowNotesStatusVisibility` (status × visibility) | `src/gm/shadow-notes.ts` (new), any route touching `shadow_notes` |
| `shareAlikeDerivatives` (allow_derivatives × share_alike) | `src/characters/license-enforcement.ts`, `src/routes/characters/license.ts` |
| `branchesDisplayInvariant` (is_active × active_branch_id) | `src/chat/service/branches.ts` (just split, `branch-helpers.ts`) |
| `ItemInstanceState` (stackable × durability × is_active) | `src/story/items/placement.ts`, `src/story/items/instances.ts` |

**Acceptance Criteria:**

- [ ] New module `src/db/validators/enforce.ts` exporting `assertValidWrite(table: TableName, row: Record<string, unknown>): void` — dispatches to the right validator via a small table→validator map.
- [ ] Six service entry points each call `assertValidWrite` before the Kysely insert/update. Existing service tests continue to pass.
- [ ] One new test per validator covering the runtime call (mock insert/update and assert the helper throws on the invalid pair).
- [ ] `bun run check` green (no `as never` casts introduced; existing validator unit tests still pass).

**Tags:** db, state-machine, validators, runtime
**Related:** src/db/state.ts, src/db/enums-core/messages.ts, src/characters/license-enforcement.ts, src/chat/service/branches.ts, src/story/items/placement.ts, .plan/tickets/TASK-adopt-state-machine-framework-in-runtime-status-writes.md, .plan/tickets/TASK-gate-branches-display-invariant-item-instance-state.md, .plan/tickets/TASK-gate-shadow-notes-status-x-visibility-composite.md, .plan/tickets/TASK-gate-world-lore-lifecycle-confidence-distortion-disputed-tri.md, .plan/tickets/TASK-gate-licensing-triple-via-licenserightsvalidator.md, .plan/tickets/TASK-gate-worlds-rpg-7-col-flags-through-master-mechanics-validat.md


git issue: 63a45b3
