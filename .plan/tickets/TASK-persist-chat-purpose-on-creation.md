<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Persist chat purpose on creation

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

The variant system validates a (type, mode, purpose) triple but createChat only persists type and mode. The purpose field (e.g. rpg, combat, social) is computed by resolveVariantOverrides but never stored. Need: purpose column on chats table, persist in createChat, expose in API responses.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
