<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: character create silently drops personality/scenario/welcomeMessage/tags

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small

## Summary

src/routes/characters/create.ts:26-38 destructures and writes them (:61-67), but ActorCreateBody (src/validation/schemas/actors.ts:20-28) declares none -> Elysia strips -> create-modal (src/partials/characters/create-modal.html) persists NULL personality; card/export read the columns, only create broken. Fix: extend ActorCreateBody (+agentRole C3), test create round-trip.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
