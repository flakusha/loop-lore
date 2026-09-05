<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: actorType persona 422 on valid UI input

**Status:** ✅ Resolved (fixed 2026-09-05)
**Priority:** medium
**Effort:** Small

## Summary

create-modal.html:38 offers persona, ActorTypeSchema (src/validation/schemas/primitives.ts:127) = user|character|narrator|system. Fix: add 'persona' to schema or remove UI option.

## Resolution

Fixed 2026-09-05 via the ticket's "remove UI option" branch (contingency A1). Personas are a distinct entity with their own routes (`src/personas/controller.ts` — `/api/personas`, `/api/personas/:id/convert-to-character`), NOT actors; the actor create-modal posts to `/api/actors`, so the persona option targeted the wrong entity.

- `src/partials/characters/create-modal.html:37` — removed the `<option value="persona">`; only `character` remains.
- `ActorTypeSchema`/`ActorType` untouched — `user|character|narrator|system` is the correct actor set.
- Verified: no test regressions (`bun test src/routes/characters/create.test.ts` 3 pass).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
