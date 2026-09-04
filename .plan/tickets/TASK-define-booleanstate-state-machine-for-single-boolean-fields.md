<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Define BooleanState state machine for single-boolean fields

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-data-integrity-acid

## Summary

Create a generic BooleanState state machine (false→true) in enums-core/state.ts to model single boolean fields as state machines. Fields: is_playlist, is_secret, is_hidden, is_prime, enabled, nsfw_enabled, user_override, supports_tools, supports_vision, supports_thinking, federation_consent, streaming, auto_advance, explicit, nsfw_hidden. Each field gets a StateDef<BooleanState> and createMachine(BooleanState). This provides extensibility: future ternary states (enabled_with_caveats) can be added without schema migration. High priority — boolean IS a state machine. Small effort — single machine definition reused across all fields.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
