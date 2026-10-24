<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: turn-manager lifecycle requestRegeneration line 26 is dead code

**Status:** Not Started
**Priority:** Low
**Effort:** Medium
**Epic:** epic-actor-turn-skip

**Summary:**

`src/turning/turn-manager/lifecycle.ts:26` pre-mutates `host.state.pendingRegeneration`
before calling `persistState`, but `persistState` (state.ts:107) replaces `host.state`
with a freshly constructed object BEFORE running the mutation callback (line 107).
The pre-mutation at line 26 is therefore always overwritten and is unreachable dead code.

## Evidence

`src/turning/turn-manager/lifecycle.ts:26`:

```ts
  host.state.pendingRegeneration = { turnId, attempt: nextAttempt, reason };
```

Then `persistState` callback (line 28) sets it again. Any value written at line 26
is discarded when `host.state = {...}` executes inside `persistState`.

## Source

- review-chat.md finding 10
- review-consolidated.md nit (lifecycle.ts dead code)
- File:line: `src/turning/turn-manager/lifecycle.ts:26`

**Context:**

`persistState` is the only writer of the turn-manager state: it re-reads the committed row, rebuilds `host.state` from it, and only then runs the caller's mutation. Any direct assignment to `host.state` before that call is therefore discarded — the pre-mutation at line 26 was unreachable.

It was not harmless. When the write cannot land (the chat row is gone), `persistState` returns without touching `host.state`, so the pre-mutation was the only thing that made the in-memory state claim a pending regeneration that no row carried. Removing it makes the in-memory state reflect exactly what was persisted.

Known limitation (not changed here): `requestRegeneration` still returns `true` when the persist could not land — `persistState` does not report the failure. Callers must not treat the return value as "the regeneration is now pending".

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Resolution:**

- `src/turning/turn-manager/lifecycle.ts:25-32` — the dead pre-mutation was removed; the state is now only changed through the mutation that `persistState` writes.
- Regression test: `src/turning/turn-manager.test.ts` → "requestRegeneration() > does not claim a pending regeneration that was never persisted" (the chat row is gone, so nothing can be persisted — the in-memory state must not claim a pending regeneration).
