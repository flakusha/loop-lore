<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-file-split-chat-service: Split `src/chat/service.ts` (1830L)

**Status**: open
**Priority**: high
**Labels**: refactor, file-split, god-module
**Assignee**:
**Epic**: epic-file-splitting
**Related**: TASK-size-strict-debt, TASK-split-messages-route

## Description

`src/chat/service.ts` is 1830 lines — the largest source file in the repo. It is a flat bank of
35 exported free functions (access, message CRUD, visibility, transitions) sharing a
`Kysely<DB>` dependency. Split into a `src/chat/service/` directory using the **barrel + domain
subdirectory** pattern.

## Approach

```
src/chat/service/          (was service.ts)
  index.ts          # barrel — re-export public API; external imports unchanged
  access.ts         # checkChatAccess, getMessageWithAccess
  messages.ts       # listMessages, message CRUD
  visibility.ts     # updateMessageVisibility, pin/unpin, PinnedState
  transitions.ts    # transition classification, promotion
  errors.ts         # ServiceError, UpdateChatResult, KeyMechanicConflictError types
```

- Thread the shared `Kysely<DB>` explicitly (current signature style).
- Where a function already takes many positional deps, prefer an options-object + default-deps
  factory mirroring `src/generation/auto-gen.ts` (`AutoGenOpts` / `GenDeps` / `createDefaultDeps`).
- Derive any exported public types via `ReturnType`/`Parameters` instead of hand-rolling a
  parallel interface (single source of truth).

## Acceptance Criteria

- [ ] `src/chat/service.ts` removed; `src/chat/service/` split modules each exist
- [ ] Each split module < 200 lines; barrel re-exports unchanged public API
- [ ] `bun run typecheck` / `bun run check` pass
- [ ] All existing chat tests pass (no behavior change)
- [ ] `bun run dead:code` exits 0 (no orphaned exports)

## Notes

The `consistent-type-imports` ESLint rule is active — keep `import type` for type-only imports.
