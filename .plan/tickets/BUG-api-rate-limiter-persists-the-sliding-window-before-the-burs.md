<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: API rate limiter persists the sliding window before the burst check, so burst-denied requests consume steady-state budget

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

Location: src/api-governance/rate-limiting/limiter.ts:63-91.

Evidence: the slidingWindow(...) result is persisted at :66 (saveWindow(key, win.kept, ...)) BEFORE the burst check at :77-91; a burst denial (:83-91) leaves the just-pushed timestamp in the saved window, so requests rejected by the bucket still erode the window budget.

Verification: CODE-READ - limiter.ts:63-91 re-read verbatim this session: :65 (window slide) -> :66 (saveWindow with the pushed timestamp included) -> :77-82 (bucket load/save) -> :83-91 (denial return; no re-save of a trimmed window). Executing needs the api-governance store live; the write ordering is fully determined by the read.

Impact: under burst, denied requests still consume window budget - effective throughput is lower than the configured limits, and retrying clients dig a deeper hole.

Fix: on burst denial, persist win.kept without the just-pushed timestamp (re-save a trimmed window).

Source: .tmp/glm-review/deep-integrations-1015.md F-4 (gitignored; recorded here verbatim). Note: this is the api-governance limiter, distinct from the Done tickets BUG-limiter-is-fixed-window-but-mislabeled-sliding-window-2x-bou (85a5418) and BUG-rate-limit-sliding-window-expiry-uses-cutoff-off-by-one-reta (70472f7).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
