<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: wrapper-evaluation-capacitor-vs-pwa

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-mobile-app
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Spike matrix (code-sharing / native camera+push+filesystem / packaging / offline / self-host cost incl. FCM/APNs + store accounts) using capacitor-web-to-mobile POC as reference; recommend Capacitor-vs-PWA-only; do NOT create loop-lore-mobile/ yet. Owner epic: epic-mobile-app (literally its task 1 technology decision). Anchors: epic-mobile-app.md (Not Started, blocked on epic-transport-expansion + epic-headless-alternative-frontends); src/frontend/alpine/mobile-composer.ts; src/frontend/touch.ts. Refs: https://github.com/tranthienhau/capacitor-web-to-mobile (reference impl); https://capacitorjs.com/ (deferred dep); https://htmx.org/essays/you-cant/ (MPA adequacy). Acceptance: decision recorded on epic-mobile-app task 1; push/camera/deep-link path named with self-host cost; blocked-deps confirmed still-red or cleared. DEFER: Capacitor code, React Native, FCM wiring. Source: mobile-gap research 2026-10-29.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
