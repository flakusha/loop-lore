<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: actorType persona 422 on valid UI input

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small

## Summary

create-modal.html:38 offers persona, ActorTypeSchema (src/validation/schemas/primitives.ts:127) = user|character|narrator|system. Fix: add 'persona' to schema or remove UI option.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
