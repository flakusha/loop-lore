<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Creative process commit gating

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** High
**Epic:** epic-assistant-gm-flows
**Labels:** assistant, lore, generation, quality
**Issue:** `720ed41`
**Related:** `src/assistant/commands/create.ts`, `src/db/enums-story.ts` (`SyntheticDataStatus`), `src/assistant/prompt/sections/lore.ts`, `docs/spec/lore.md`, `FEAT-lore-structured-generation-via-assistant`

## Summary

Generated entities (`/create world/loc/char/item`) must **NOT be immediately public**. Add a **draft → review → commit(publish)** lifecycle with a **separate commit step after quality review**. A low-quality or structurally-broken generated world must not leak into live injection.

## Background

**Current `/create` flow has NO commit gate** (verified 2026-08-01):

```
/create world <desc> → LLM → parse JSON → INSERT INTO worlds (live) → immediately active/public
```

- Inserts directly into live tables — a low-quality or structurally-broken world is immediately live and injected
- `worlds`/`locations` have **no status field**; `actors.visibility` (private/public), `items.visibility` (visible/hidden), `lore_entries.enabled` exist but are **never set by `/create`**
- Epic's "confirmation gating" is only a pre-create approval in a flow diagram — **not implemented**, no separate "make public after review" step

**Precedent (unused):** `SyntheticDataStatus` state machine (`src/db/enums-story.ts:199`) — `generated → validated → approved → rejected → archived` — defined, **zero callers**. Perfect scaffold.

## Scope

### 1. Publication lifecycle state machine

Mirror the existing `SyntheticDataStatus` machine:

```
draft → review → published → archived
   ↓        ↓
 rejected (reworkable back to draft)
```

| State       | Meaning                  | Injected/visible? |
| ----------- | ------------------------ | ----------------- |
| `draft`     | Generated, stored        | No                |
| `review`    | Flagged for human review | No                |
| `published` | Committed after review   | Yes               |
| `rejected`  | Discarded (reworkable)   | No                |
| `archived`  | Retired                  | No                |

### 2. Persistence

Add `publication_status` column (or reuse existing fields):

| Table          | Field                                     |
| -------------- | ----------------------------------------- |
| `worlds`       | new `publication_status` (none today)     |
| `locations`    | new `publication_status` (none today)     |
| `actors`       | reuse `visibility` or new field           |
| `items`        | reuse `visibility`                        |
| `lore_entries` | reuse `enabled` (only `enabled` injected) |

### 3. `/create` writes DRAFT

`/create` inserts entities in `draft` state — never public. No injection/visibility until committed.

### 4. Injection gate

`loreSection` (and world/lore injection) only considers `published`/`enabled` entries — drafts never leak into prompts.

### 5. Commit / reject commands

- `/commit <entityType> <id>` — explicit, separate step after review → `published`
- `/reject <entityType> <id>` — discard (reworkable back to draft)

### 6. Quality/validation gate (ties to `epic-assistant-gm-flows`)

Before commit, run schema validation + consistency/duplicate checks (see `FEAT-lore-structured-generation-via-assistant`). Reject structurally-broken data at `draft`; block `commit` on validation failure.

## Acceptance Criteria

- [ ] Publication lifecycle state machine implemented (reuse/extend `SyntheticDataStatus`)
- [ ] `/create` writes entities as `draft`, never public
- [ ] `worlds`/`locations` gain `publication_status` (migration)
- [ ] `loreSection` + world/lore injection only injects `published`/`enabled` entries
- [ ] `/commit <type> <id>` publishes after review; `/reject` discards
- [ ] Validation failure blocks commit (schema/consistency/duplicate)
- [ ] Draft/rejected/archived entities never leak into prompts
- [ ] Unit tests for lifecycle transitions + injection gating
- [ ] `bun run check` + `bun test src/` pass

## Files

- `src/assistant/commands/create.ts` — write as draft (primary)
- `src/assistant/commands/commit.ts` — `/commit` + `/reject` (new)
- `src/db/enums-story.ts` — extend `SyntheticDataStatus` machine
- `src/db/migrations/` — `publication_status` on worlds/locations
- `src/assistant/prompt/sections/lore.ts` — injection gate on published/enabled
- `src/validation/` — quality gate before commit

## Notes

- Separate ticket — intentionally isolated from other in-flight `epic-assistant-gm-flows` tickets.
- Complements `FEAT-lore-structured-generation-via-assistant` (structured lore generation); commit gating is the safety layer ensuring generated data is reviewed before it becomes live.
- Reuses the already-defined-but-unused `SyntheticDataStatus` state machine — no new state-machine infra needed.
