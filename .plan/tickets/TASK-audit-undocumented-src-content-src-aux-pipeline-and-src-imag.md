<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Audit undocumented src/content, src/aux-pipeline and src/image-edit modules

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-docs-reconciliation

**Summary:**

This is the blocker keeping `.plan/epics/epic-docs-reconciliation.md` open.

The epic's AC6 requires an audit of undocumented `src/` modules, and names three explicitly: `src/content`, `src/aux-pipeline`, `src/image-edit`. Its own tracker row for `TASK-doc-audit-undocumented-src-modules.md` is still Not Started.

Everything else in that epic is shipped and verified: `isDocsServed()` plus `{{docsNav}}` injection at `src/routes/views/layout.ts:65`, dead sidebar links fixed in `docs/.vitepress/config.mts`, and the how-to guides under `docs/guide/`. This audit is the only unmet criterion.

Implementation: for each of the three modules decide doc-or-no-doc, and where a doc is warranted write it and wire it into the vitepress sidebar. `docs/reference/api.md` is currently hand-maintained and is the natural landing page for the `src/content` and `src/image-edit` surface.

This closes AC6 and unblocks closing the epic.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
