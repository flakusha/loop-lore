<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Audit panel renders action text labels instead of icons

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

**Where**: src/components/chat/memory-panel.html:258

**What**: transform.ts:auditActionLabel text-only — add icon/emoji mapping per action.

**Fix**: Add icon/emoji mapping per action.

**Source**: FEAT-075 gap audit (.tmp/audit/SYNTHESIS.md)

**Context:**

Audit panel (FEAT-075) renders audit-log action labels as plain text. Spec acceptance criterion requires action icons (emoji) for at-a-glance recognition.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
