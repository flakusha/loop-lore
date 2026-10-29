<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Web editor: config section plus Bun floor (web.editor/web.terminal)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-browser-editor-support
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Epic: epic-browser-editor-support. Register web.editor (default vscode) plus web.terminal.enabled/allowRemote via 4-point config pattern. Decide CI Bun floor to >=1.4.0 (1.2.x silently ignores spawn terminal) or keep feature-detect. Route must refuse when typeof Bun.Terminal is not function. Full context in tree/web-editor-term/.plan/epics/epic-browser-editor-support.md.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

git issue: c9decab
