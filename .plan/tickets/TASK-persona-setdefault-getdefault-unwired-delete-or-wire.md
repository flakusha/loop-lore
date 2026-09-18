<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Persona setDefault/getDefault unwired: delete or wire

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

PersonasService.setDefault (src/personas/service.ts:154) and getDefault (service.ts:175) have zero production callers; the UI sets default persona via PATCH isDefault (frontend alpine/personas.ts:130) and the docs promise 'set as default for your chats' (docs/guide/personas.md:20). Decide: either delete both methods (ponytail — dead code) or wire them into the personas page; docs promise suggests wiring was intended. Also confirm the default-persona feature actually works end-to-end either way.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
