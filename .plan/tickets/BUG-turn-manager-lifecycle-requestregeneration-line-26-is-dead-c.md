<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: turn-manager lifecycle requestRegeneration line 26 is dead code

**Status:** Not Started
**Priority:** Low
**Effort:** Medium

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

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
