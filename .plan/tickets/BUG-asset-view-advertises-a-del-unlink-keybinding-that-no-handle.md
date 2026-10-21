<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Asset view advertises a Del: unlink keybinding that no handler implements

**Status:** Done
**Priority:** medium
**Effort:** Small
**Epic:** epic-terminal-ui

**Summary:**

The asset sidebar's detail pane rendered a `Del: unlink` hint (src/tui/asset-view.ts:114) promising a delete capability, but no key handler was ever bound to it — the sidebar only binds left/right for navigation (src/tui/asset-view.ts:100-107). The hint taught users a capability that did not exist, and a user pressing Del saw nothing happen.

Fixed in 050eb320d by removing the claim rather than implementing unlink: the TUI has no confirmation prompt or undo for a destructive asset delete, so shipping the binding would have meant a one-keypress irreversible action. The hint now ends at `← → navigate`, which is exactly what the view does.

Acceptance Criteria:

- [ ] The asset detail pane advertises only keybindings that have a handler
- [ ] If unlink is ever implemented, it ships with a confirmation step first

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
