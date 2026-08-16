<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-file-split-routes: Split oversized route modules (views/messages/auto-gen/admin)

**Status**: open
**Priority**: high
**Labels**: refactor, file-split, routes, god-module
**Assignee**:
**Epic**: epic-file-splitting
**Related**: TASK-split-messages-route, TASK-split-generate-route, TASK-chat-route-extraction

## Description

Oversized route/orchestration modules exceed the 250L guard and couple HTTP handling with heavy
business logic. Apply the **delegate/facade** + **barrel** pattern, moving business logic down to
the service layer so routes become thin HTTP adapters.

## Targets

| File                         | Lines | Split into                                                                                    |
| ---------------------------- | ----- | --------------------------------------------------------------------------------------------- |
| `src/routes/views.ts`        | 1524  | view-domain route modules (chat-list, world, admin, etc.)                                     |
| `src/routes/messages.ts`     | 1121  | `src/routes/messages/` (crud/stream/attachments/archiving) — aligns TASK-split-messages-route |
| `src/generation/auto-gen.ts` | 1119  | pipeline step modules (orchestration vs per-provider steps)                                   |
| `src/routes/admin.ts`        | 1091  | admin domain modules                                                                          |
| `src/routes/worlds.ts`       | 765   | world domain modules                                                                          |
| `src/routes/characters.ts`   | 553   | character route modules                                                                       |

## Approach

- Business logic moves to the service layer (or stays in it); route files keep only HTTP
  translation (Elysia handler, param parsing, error → status mapping).
- Non-route orchestrators (`auto-gen.ts`) split orchestration from concrete steps, mirroring the
  existing `GenDeps` DI seam.
- Each split directory gets an `index.ts` barrel re-exporting the Elysia module so `elysia-app.ts`
  wiring is unchanged.

## Acceptance Criteria

- [ ] Each target module split; resulting files < 200 lines where feasible
- [ ] Route registration (`elysia-app.ts`) unchanged or mechanically equivalent
- [ ] `bun run check` passes; route tests pass (no behavior change)
- [ ] `bun run dead:code` exits 0

## Notes

These files are the `size:strict` offenders that block promotion of the size guard. Pure-refactor;
do not change HTTP contracts.

**Progress (2026-08-07, worktree file-split-refactor):**

- ✅ `src/generation/auto-gen.ts` (1119L) → `src/generation/auto-gen/` barrel + pipeline modules.
  9 public exports preserved; `bun run typecheck` green, 340 generation + 33 route tests pass,
  eslint 0 errors, `dead:code` exit 0. Commit `518429e5`.
- ✅ `src/chat/service.ts` (1830L) → `src/chat/service/` barrel + domain modules.
  50 public exports preserved; typecheck green, 149 chat + 725 route/generation tests pass,
  eslint 0 errors, `dead:code` exit 0. Commit `8f457158`.
- 🔄 `src/routes/messages.ts` (1121L) → `src/routes/messages/` — in progress (subagent).
- ⏳ Remaining: `views.ts` (1524L), `admin.ts` (1091L), `worlds.ts` (765L), `characters.ts` (553L).
