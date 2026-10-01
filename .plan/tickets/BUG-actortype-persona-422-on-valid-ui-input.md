<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: actorType persona 422 on valid UI input

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Status Note:** fixed 2026-09-05
**Priority:** medium
**Epic:** epic-actors
**Effort:** Small
**Epic:** epic-character-core-system.md
**Tags:** character-core-system

## Summary

create-modal.html:38 offers persona, ActorTypeSchema (src/validation/schemas/primitives.ts:127) = user|character|narrator|system. Fix: add 'persona' to schema or remove UI option.

## Resolution

Fixed 2026-09-05 via the ticket's "remove UI option" branch (contingency A1). Personas are a distinct entity with their own routes (`src/personas/controller.ts` — `/api/personas`, `/api/personas/:id/convert-to-character`), NOT actors; the actor create-modal posts to `/api/actors`, so the persona option targeted the wrong entity.

- `src/partials/characters/create-modal.html:37` — removed the `<option value="persona">`; only `character` remains.
- `ActorTypeSchema`/`ActorType` untouched — `user|character|narrator|system` is the correct actor set.
- Verified: no test regressions (`bun test src/routes/characters/create.test.ts` 3 pass).

## Acceptance Criteria

- [x] Persona option removed from actor create-modal; only `character` remains (`src/partials/characters/create-modal.html:36-38` — no `value="persona"` anywhere in `src/`)
- [x] `ActorTypeSchema` stays `user|character|narrator|system` (`src/validation/db-schemas.ts:12`, re-exported via `src/validation/schemas/primitives.ts` + `actors.ts`)
- [x] Personas remain a distinct entity with own routes (`src/personas/controller.ts`: `/api/personas`, `/api/personas/:id/convert-to-character`)
- [x] No regressions: `bun test src/routes/characters/create.test.ts` 3 pass (Resolution 2026-09-05, contingency A1 — fix landed, NOT reopened)
