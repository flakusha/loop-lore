<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: character create silently drops personality/scenario/welcomeMessage/tags

**Status:** ✅ Resolved (fixed 2026-09-05)
**Priority:** high
**Effort:** Small

## Summary

src/routes/characters/create.ts:26-38 destructures and writes them (:61-67), but ActorCreateBody (src/validation/schemas/actors.ts:20-28) declares none -> Elysia strips -> create-modal (src/partials/characters/create-modal.html) persists NULL personality; card/export read the columns, only create broken. Fix: extend ActorCreateBody (+agentRole C3), test create round-trip.

## Resolution

Fixed 2026-09-05. Verified `bun test src/routes/characters/create.test.ts` (3 pass, new "persists personality/scenario/welcomeMessage/tags/agentRole" case; `bun run typecheck` `EXIT=0`):

- `src/validation/schemas/actors.ts:28-32` — `ActorCreateBody` gains `tags`, `personality`, `scenario`, `welcomeMessage`, and `agentRole` (all optional strings).
- Handler unchanged (`create.ts:26-38` already destructured and wrote them once the schema stopped stripping them). Tags parse into `settings` JSON; the test asserts the parsed `{tags:[...]}`.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
