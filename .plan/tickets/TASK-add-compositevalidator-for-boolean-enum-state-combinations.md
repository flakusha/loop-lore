<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add CompositeValidator for boolean × enum state combinations

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-data-integrity-acid

## Summary

Create CompositeValidator instances for boolean × enum state machine combinations: nsfw_enabled × access_status, federation_consent × activitypub_actor_keys.status, generation_attempts.status × side_effect_jobs_cancelled, model_capabilities.supports_tools × supports_vision × supports_thinking, blog_posts.status × blog_posts.visibility, chats.nsfw_override × chats.mode. Each validator enforces valid state combinations at the application layer using the existing CompositeValidator<A,B> pattern from messages.ts. High priority — boolean fields are state machines (false→true), and their combinations must be validated. Medium effort — requires adding new validator definitions to enums-core/state.ts or domain-specific enum files.

## Analysis (2026-09-04)

Pure code change — **no migration needed** and no `COLUMN_TYPE_OVERRIDES`. All six combinations validate existing columns via the existing `CompositeValidator<A,B>` pattern (`src/db/state.ts`); boolean members use a generic `BooleanState` (`false→true`). New validator definitions only, in `enums-core/state.ts` or domain enum files. No `src/db/migrations/*` change.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
