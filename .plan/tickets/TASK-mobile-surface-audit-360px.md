<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: mobile-surface-audit-360px

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-accessibility-input
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Render admin/world-edit/settings/chat/gallery at 360x740 + touch emulation; record pass/fail per surface (table overflow, 2-col splits, modal reach, tap-target <44px, hover-only controls). Owner epic: epic-accessibility-input (Phase 5 mobile-testing open). Anchors: src/views/layout.html:8 (viewport) + :39 (responsive.css last); src/frontend/touch.ts (message-list gestures only); src/frontend/alpine/mobile-composer.ts. Refs: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable; https://gothartech.com/en/insights/pwa-2025 (PWA-first wrapper-later framing). Acceptance: gap matrix checked into ticket; one follow-up wire ticket per failing surface OR explicit pass note; no code changes. Source: mobile-gap research 2026-10-29.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
