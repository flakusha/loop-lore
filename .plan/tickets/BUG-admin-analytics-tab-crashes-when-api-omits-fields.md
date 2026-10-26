<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Admin analytics tab crashes when API omits fields

**Status:** Done
**Status Note:** [2026-10-26 sweep-A verify] FIXED (issue 05bcb6e): src/views/admin.html:1914 and :1920 now use (conversationOverview.averageSessionLength ?? 0).toFixed(1) / (avgLatencyMs ?? 0).toFixed(0) — omitted API fields no longer throw.
**Priority:** high
**Effort:** Medium
**Epic:** epic-frontend-admin

**Summary:**

conversationOverview.averageSessionLength.toFixed(1) and conversationOverview.avgLatencyMs.toFixed(0) (src/views/admin.html:1809,1813) throw TypeError if the API response omits these fields. The initial state has them as 0, but loadAnalytics() replaces the entire object with the API response (admin-analytics.ts:81). Impact: Analytics tab crashes silently — user sees blank content with no error message. Fix: Use nullish coalescing: conversationOverview.averageSessionLength?.toFixed(1) ?? '0.0' and same for avgLatencyMs. Or merge the API response with defaults.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 05bcb6e (registry tip: 2f22ed7d2 Konstantin Fedotov Close issue)
