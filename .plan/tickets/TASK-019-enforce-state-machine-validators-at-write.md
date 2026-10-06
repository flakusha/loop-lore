<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Enforce state-machine + composite validators at write time

**Status:** Done
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

## Resolution

`assertValidWrite(table, row)` lands at `src/db/validators/enforce.ts:159`, dispatching
through a typed `GUARDS` map (`src/db/validators/enforce.ts:137`). Existing validator
definitions are reused as-is, never re-declared:

- `messagesStatusVisibility` — `src/db/enums-core/messages.ts:90`
- `shadowNotesStatusVisibility` — `src/db/enums-gm.ts:97`
- `shareAlikeDerivatives` — `src/characters/license-enforcement.ts:68`

Eight write sites are instrumented (the ticket predicted six):

- `src/chat/service/write.ts:153` — regen variant insert (`sending` × `visible`)
- `src/chat/service/visibility.ts:46` — visibility update, merging persisted `status`
- `src/routes/gm-notes/shadow.ts:174` — GM-panel shadow note insert
- `src/routes/gm-notes/shadow.ts:202` — reveal transition, merged with persisted `visibility`
- `src/chat/proactive/annotations.ts:134` — proactive `shadow` annotation insert
- `src/routes/character-licensing.ts:154` / `:169` — licensing upsert update + insert
- `src/characters/importers/character-systems/licensing.ts:43` / `:57` — importer upsert

### Deviations from the ticket's table

Three of the six named validators could not be enforced as written:

1. **`branchesDisplayInvariant` does not exist.** No such symbol is defined or
   referenced anywhere in `src/`. The real rule is cross-table
   (`chat_branches.is_active` × `chats.active_branch_id`) and is already enforced
   structurally by the single transaction at `src/chat/service/branches.ts:155`,
   which clears then sets the flag atomically. A per-row validator cannot decide
   it — it needs the sibling rows. Left as-is; inventing a validator here would
   have encoded a rule the code does not have.
2. **`ItemInstanceState` does not exist as an export.** The real symbol is
   `isItemInstanceStateConsistent` at `src/story/items/placement.ts:62`, a
   3-argument predicate over `(category, stackable) × (current, max durability) ×
   is_active` — not a two-axis `CompositeValidator`, so it does not fit the
   table→validator map. Its two call sites (`src/story/items/placement.ts:115`
   and `:168`) already invoke it on every insert path, so this invariant was
   never unenforced.
3. **`loreDisputedInvariant` (`src/assistant/lore/lifecycle.ts:206`) has no write
   site to guard.** `world_lore_entries.distortion_level` and `.disputed` are
   `Generated<number>` columns and no production code writes them; the single
   `updateTable("world_lore_entries")` in `src/assistant/prompt/sections/lore.ts`
   sets only `last_activated`/`last_verified`. The invariant is consumed read-side
   by `resolveDisputedState` (`src/assistant/lore/lifecycle.ts:223`), which heals
   the legacy `at_cap:clear` drift rather than rejecting it. Guarding it would
   have required a write path that does not exist.

### Guarantee provided

Validation runs at the **service write site**, before the Kysely call — not at the
DB boundary. A raw query through the driver still bypasses it. The ticket's AC
asked for service entry points, so that is what is delivered; a true DB-boundary
guarantee would need SQL triggers (the mechanism already used by
`src/db/migrations/018_guard_triggers_update_twins.ts`) and would be a schema
change, which this ticket explicitly excludes.

`src/db/validators/enforce.test.ts` covers a valid transition, an invalid
transition, and boundary cases (missing axis column, non-0/1 flag) per validator.

### Defect found and fixed during review

The first cut of the `messages` guard rejected every row whose `status` was the
column's legacy DB default `"visible"` (`src/db/migrations/001_init.ts:1864`) — a
value that is not a member of `MessageStatus`. `updateMessageVisibility` is called on
such rows by the profanity gate (`src/routes/messages/create.ts:179`,
`src/routes/messages/forward.ts:148`) and by the existing
`src/chat/service/visibility.test.ts:42`, so the guard would have turned a
visibility change into a thrown error on legacy and default-inserted rows.

Fixed at `src/db/validators/enforce.ts:100`: the guard now consults
`KNOWN_STATUSES` and passes an unrecognised axis through unchecked, validating only
the axis actually being written. Enforcement for every real `MessageStatus` is
unchanged. Covered by `src/db/validators/enforce.test.ts:31`.

**Tags:** db, state-machine, validators, runtime
**Related:** src/db/state.ts, src/db/enums-core/messages.ts, src/characters/license-enforcement.ts, src/chat/service/branches.ts, src/story/items/placement.ts, .plan/tickets/TASK-adopt-state-machine-framework-in-runtime-status-writes.md, .plan/tickets/TASK-gate-branches-display-invariant-item-instance-state.md, .plan/tickets/TASK-gate-shadow-notes-status-x-visibility-composite.md, .plan/tickets/TASK-gate-world-lore-lifecycle-confidence-distortion-disputed-tri.md, .plan/tickets/TASK-gate-licensing-triple-via-licenserightsvalidator.md, .plan/tickets/TASK-gate-worlds-rpg-7-col-flags-through-master-mechanics-validat.md


git issue: 63a45b3

**Resolved:** 2026-10-06 registry-driven close: git issue 63a45b3 (registry tip: a891a41fc Konstantin Fedotov Auto-closed: appended .md marker marks TASK-019-ENFORCE-STATE-MACHINE-V)
