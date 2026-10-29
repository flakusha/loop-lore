<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# FEAT: pwa-manifest-offline-shell

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-accessibility-input
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Serve manifest.json + theme-color/apple-touch-icon from layout; vanilla sw.js caching app shell (CSS/JS/layout) cache-first + /dynamic/* network-first with offline fallback page. No Workbox, no new dep. Owner epic: epic-accessibility-input (extends Phase 2 responsive track). Anchors: src/views/layout.html:8 + :39; src/frontend/alpine/notifications.ts (SSE + 15s poll, no SW/Push); no manifest.json/sw.js in repo (new surface). Refs: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable; https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation. Acceptance: MDN installability checklist passes; airplane-mode reload renders shell + fallback; desktop byte-identical; bun test for manifest route + SW allowlist. DEFER: Workbox, FCM wiring. Source: mobile-gap research 2026-10-29.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
