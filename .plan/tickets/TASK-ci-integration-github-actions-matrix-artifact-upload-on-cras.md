<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: CI integration — GitHub Actions matrix + artifact upload on crash

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** Fuzzing Infrastructure

**Summary:**

Wire fuzzing targets into GitHub Actions via a matrix strategy. Each target: 30-minute timeout, artifact upload on crash (corpus + crashes + coverage report). Secrets must be redacted from logs. Integrates with the `FuzzTestFramework` run interface. Schedule: nightly for all targets, on-demand for regression. Artifact retention policy: 30 days for crash artifacts, 90 days for corpus.

**Context:**

Local fuzzing finds local bugs; CI integration finds bugs in every push and ensures crash artifacts survive beyond a developer's machine. A matrix strategy across targets (auth, asset, chat, llm, admin, IPC) with 30-minute timeouts and artifact upload on crash provides the continuous coverage baseline the epic calls for. Nightly runs cover all targets; on-demand runs cover regressions. Crash artifacts (input + stack + coverage report) feed the cluster's triage pipeline.

Constraint: secrets must be redacted from logs — the existing gate runner in `scripts/check/parallel.mjs` has no precedent for artifact handling, so secret redaction must be explicitly designed. Bun's runtime constrains how fuzzing targets are invoked in GHA; native C/C++ fuzzing setups do not apply directly.

Alternative: extend `scripts/check/parallel.mjs` gate runner to host fuzzing targets rather than a separate GHA workflow. Rejected for now — the gate runner is synchronous and blocking; fuzzing requires long-running background jobs with artifact upload on exit status. A separate GHA workflow with matrix strategy is the cleaner integration surface, even if it means two CI systems to maintain.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
