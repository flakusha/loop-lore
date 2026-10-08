<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Dashboard integration — coverage, crashes, corpus, performance, ROI panels

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** Fuzzing Infrastructure

**Summary:**

Add fuzzing panels to the performance/SLO dashboard (`epic-performance-dashboard-slo.md`): coverage heatmaps (per-target edge coverage over time), crash rate and severity trends, corpus growth and diversity metrics, per-iteration performance (p50/p95 latency), and fuzzing ROI (crashes found per compute-hour). Wire to `FuzzCoverage`, `FuzzCrash`, `FuzzCorpus` data emitted by `FuzzTestFramework`. Feeds from the continuous cluster ticket.

**Context:**

Fuzzing results are useless if no one can see them. The dashboard panels make fuzzing observable: coverage heatmaps show which code paths remain unexplored, crash rate trends show whether new code is introducing regressions, corpus growth metrics show whether the mutation engine is finding novel inputs, and ROI panels justify the compute cost. These panels wire to `FuzzCoverage`, `FuzzCrash`, and `FuzzCorpus` emitted by `FuzzTestFramework`, and feed from the continuous cluster's ongoing runs.

Constraint: the `epic-performance-dashboard-slo.md` panels must be designed before implementation — the epic defines the data model but not the panel layout. Source-map-aware coverage instrumentation (epic harness requirement) must be wired through to the coverage heatmap to avoid showing raw instruction addresses. The dashboard is a read-only consumer of cluster output; it does not trigger fuzzing jobs.

Alternative: defer dashboard and rely on GHA artifact download for crash inspection. Accepted as a v1 workaround but rejected long-term — crash artifact inspection is a single-developer workflow. Observable fuzzing metrics across all targets require a shared dashboard, especially as the cluster scales beyond one machine.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
