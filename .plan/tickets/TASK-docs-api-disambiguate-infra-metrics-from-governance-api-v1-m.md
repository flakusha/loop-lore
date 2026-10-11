<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: docs(api): disambiguate infra /metrics from governance /api/v1/metrics

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** plugin-system

**Summary:**

Sources: stream-b #10. Where: src/routes/metrics.ts:110 (GET /metrics, ungated infra); src/routes/v1/governance.ts:121 (prefix/metrics, admin-gated). Gap: two unrelated Prometheus surfaces share the metrics name at different paths with different auth (ungated infra vs admin-gated governance), inviting operator and dashboard confusion. Acceptance: docs/dashboard references name them distinctly (infra vs API-governance) with cross-links in both code comments, or exposition is consolidated behind one surface. Priority: low - naming/docs confusion; no behavioral bug.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
