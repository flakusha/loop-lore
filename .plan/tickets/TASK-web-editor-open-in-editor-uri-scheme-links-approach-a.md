<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Web editor: open-in-editor URI-scheme links (approach A)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-browser-editor-support
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Epic: epic-browser-editor-support. Add editorUrl(path,line,editor) helper emitting vscode:// / zed:// / cursor:// / idea:// links plus Open in $EDITOR buttons at the six verified text-edit surfaces. Full context in tree/web-editor-term/.plan/epics/epic-browser-editor-support.md section A.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

git issue: 42b9293
