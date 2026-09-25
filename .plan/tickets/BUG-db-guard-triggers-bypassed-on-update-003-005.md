<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: DB guard triggers bypassed on UPDATE (003, 005)

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

BEFORE INSERT-only triggers in 003_memory_audit_log_action_check and 005_world_lore_lifecycle are bypassed by UPDATE. Add 017 migration with BEFORE UPDATE twins + abort tests.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
