<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Convert Generated<number> boolean shims to boolean state machines across schema

**Status:** 🔄 Split into two tickets below
**Priority:** high
**Effort:** Large
**Epic:** epic-data-integrity-acid
**Labels:** state-machine, schema, boolean

## Summary

This ticket has been split into two higher-priority state machine tickets:

1. **TASK-define-booleanstate-state-machine-for-single-boolean-fields** (e90da19) — Create BooleanState state machine (false→true) as the generic 2-state machine for all single boolean fields. Each field gets StateDef + createMachine. Provides extensibility for future ternary states.
2. **TASK-add-compositevalidator-for-boolean-enum-state-combinations** (50517c0) — Create CompositeValidator instances for boolean × enum combinations (nsfw_enabled × access_status, federation_consent × keys.status, etc.).

Boolean fields ARE state transitions (false→true). They are the simplest form of state machine and can be extended to ternary/multi-state without schema migration. See individual tickets for details.

## Original field list (all → Generated<BooleanState>):

is_playlist, is_secret, is_hidden, is_prime, enabled, nsfw_enabled, user_override, supports_tools, supports_vision, supports_thinking, federation_consent, streaming, auto_advance, explicit, nsfw_hidden

## Original composite combinations:

- nsfw_enabled × access_status
- federation_consent × activitypub_actor_keys.status
- generation_attempts.status × side_effect_jobs_cancelled
- model_capabilities.supports_tools × supports_vision × supports_thinking
- blog_posts.status × blog_posts.visibility
- chats.nsfw_override × chats.mode

## Acceptance Criteria

- [ ] BooleanState machine defined and exported
- [ ] All 15 boolean fields converted to Generated<BooleanState>
- [ ] All composite validators implemented
- [ ] generate-db-types.ts generates correct types
- [ ] schema-core.ts interfaces use typed enums
- [ ] All consumers updated
- [ ] Tests passing
- [ ] Documentation updated
