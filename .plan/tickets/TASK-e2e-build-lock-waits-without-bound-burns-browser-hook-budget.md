<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: e2e build lock waits without bound, burns browser hook budget

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

`acquireBuildLock` in `tests/e2e/helpers/build-lock.ts` spins on a 25ms sleep with no deadline. A worker whose 90s `beforeAll` — the convention across `tests/e2e/flows/browser/` — starts while a sibling holds `dist/.build-e2e.lock` burns its whole hook budget waiting and fails with a bare hook timeout, never reaching its tests.

**Context:**

Evidence 2026-11-18 in `.tmp/intercom/LANE-theme4-enqueue-fix.md`: four consecutive `mobile-outbox.browser.ts` runs failed at 90-104s with zero test output — no `build:frontend` child, no browsers spawned; the hook was parked in the lock spin. Contributing factor: `hashFrontendSources` in `browser-frontend-build.ts` mixes file mtimes into the content hash, so any tree churn — sibling commits, even a lint fix — forces a cold `build:frontend` inside the hook and lengthens lock holds under load. A fifth run passed 3/3 in 5.85s after warming the build for the current tree and running back-to-back with the lock free and mtimes stable.

Proposed fix, owner decides shape: bound the wait in `acquireBuildLock` with a deadline that throws a named error, so contention fails fast with an actionable message instead of consuming the hook budget. Optional companion: hash file contents rather than mtimes so rebuilds only fire on real source change. The lock file is already PID-tagged with stale-PID takeover; a deadline preserves that.

**Acceptance Criteria:**

- [ ] Lock contention fails fast with an actionable message instead of consuming the hook budget
- [ ] Tests passing
- [ ] Documentation updated
