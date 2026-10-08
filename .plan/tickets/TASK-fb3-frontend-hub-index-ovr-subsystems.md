<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: FB3 frontend hub index (OVR subsystems)

**Status:** Not Started
**Priority:** low
**Effort:** Small

**Summary:**

**Status:** Not Started
**Priority:** low
**Effort:** S (layout nav and index links plus locale strings)
**Summary:** Give the frontend hub (layout) an index of its subsystems: nav and index links covering routing, headers, components, i18n, notifications, settings, admin, gallery, and composer.
**Context:** Source row matrix-frontend-backend-integration.md FB3 (OVR x all FE). Filed from 02-extract-features.md candidate 1, R02 candidate 1 confirmed. File: src/views/layout.html (plus maybe src/frontend/pages). Dependency: ship after FB5 swap-lifecycle so new index links ride the central swap path. Dedup: grepped index.json for hub index and frontend hub; zero hits. 05-prioritization.md Later parks this as docs-only; filed per assignment as next filler.
**Acceptance Criteria:**
- Layout nav links every listed subsystem and each resolves to the right page.
- New nav strings have keys in all 10 locale files.
- Browser or e2e touch covers the hub index links.
- bun run check green.
**Related:** 02-extract-features.md candidate 1, R02 candidate 1, FB5 swap-lifecycle (dependency).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
