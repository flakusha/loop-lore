<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Guided-regen frontend menu wiring on assistant messages

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** medium
**Effort:** Medium

## Summary

Deferred from prompt-power batch: backend ships registry-declared message actions (listMessageActions: try-again/add-details/more-concise) with /regen as first consumer. Wire an Alpine action menu onto assistant message bubbles that lists actions and dispatches the chosen id. Depends on: TASK-user-prompt-template-library-storage-save-as-template-unbloc only if menus share the action-registry UI; otherwise independent.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
