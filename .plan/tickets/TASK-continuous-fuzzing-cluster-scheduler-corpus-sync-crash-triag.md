<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Continuous fuzzing cluster — scheduler, corpus sync, crash triage

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** Fuzzing Infrastructure

**Summary:**

Build the continuous fuzzing cluster: scheduler distributes targets across workers, centralized corpus sync (corpus growth tracking, dedup, minimization), auto crash triage (severity classification, stack trace bucketing, duplicate detection against known crashes). Workers must be ephemeral and isolated. Integrates with `FuzzTestFramework` run interface and CI artifact upload from the CI ticket. Crash feeds into `FuzzCrash` data model. Feed: `epic-core-testing-frameworks.md` (security-test layer) and `epic-performance-dashboard-slo.md` (dashboard panels for coverage, crashes, corpus, performance, ROI).

**Context:**

A cluster turns one local fuzzing instance into continuous coverage across all targets simultaneously, with centralized corpus management that prevents redundant work. The scheduler distributes targets across workers, the corpus sync keeps each worker fed with the latest coverage-maximizing inputs, and crash triage classifies and buckets findings so the same bug is not investigated twice. Without this, local fuzzing is the ceiling — one machine, one target at a time, corpus never shared.

Constraint: workers must be ephemeral and isolated (epic requirement). Corpus sync must be deduplicated by input hash to avoid corpus bloat. Crash triage must bucket by stack trace + input hash (same dedup key as the harness runner) to integrate cleanly with the existing crash model. The local scheduler (single-machine multi-process) is the prerequisite before distributed (multi-machine) is attempted.

Alternative: stay on local fuzzing indefinitely and accept the coverage ceiling. Rejected — the epic's coverage targets (40% auth, 25% asset) require sustained iteration counts that a single machine cannot achieve across all targets simultaneously. A local scheduler is the realistic precursor; distributed cloud workers are a future scale step.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
