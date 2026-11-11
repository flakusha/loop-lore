<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: 1.0.0 THEME 4: Mobile-ready web without a native package

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

Rationale: No embedded-backend app: Bun ships no iOS/Android target, so ship a thin client over /api/v1+SSE. The layout tier already ships (767/768/479px + 44px targets); remaining work is the PWA shell/outbox ticket plus replacing the hardcoded 1024-token memory cap with a context-share budget wired to per-world token_budget.

Feeds: mobile-packaged-feasibility-2026-11-03 (SKIP packaged app; ADOPT shipped CSS tiers; FOLLOW-UP PWA ticket TASK-pwa-cached-shell-plus-send-queue + getMaxMemoryRatio gap §4)

AC4 Offline web: manifest + service-worker shell installs; queued sends survive offline->online and deliver in order; <800px tiers and 44px coarse-pointer targets verified on a phone viewport.

AC5 Memory budget: hardcoded 1024-token cap replaced by a context-share ratio honoring per-world token_budget; prompt assembly stays within budget on a measured long-context fixture.

Related: .tmp/research/release-1.0.0-roadmap.md

**Caveats:** TOCTOU: outbox drain is FIFO with idempotency keys; concurrent drain single-flighted. Security: Bearer auth on every write; PWA shell caches no secrets. Authorization: outbox replays as the originating user. Parallelism: service-worker tests are isolated; no shared fixtures. Partial failure: failed send stays queued with backoff, never dropped. Rollback: PWA shell is additive; removal restores online-only. Observability: outbox depth + drain failures surfaced in UI.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
