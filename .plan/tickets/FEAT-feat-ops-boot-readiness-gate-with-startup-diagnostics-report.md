<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: feat(ops): boot-readiness gate with startup diagnostics report

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

Derived-feature proposal F05 (composes verified app-review fixes T01-T28). Source: `.tmp/derived-features/proposals.md`. No greenfield invention: composes 2+ existing epics/tickets whose fix work is the prerequisite.

Composes: `epic-observability-telemetry.md` (Not Started) + `epic-logging-telemetry.md` (In Progress) + `epic-deployment-topologies.md` (Not Started) + T07 (init-promise logging) + T09 (readiness until plugins/seeds ready) + T26 (readiness docstring, /api/health vs /health star contrast).

Derivation: T07 names every init job's failure, T09 distinguishes booting from broken via readiness, T26 documents which probe load balancers should use. The composition is a deployment gate: orchestrators already consume `/health/ready`; the diagnostics report (which job failed, how long boot took, migration state) is the human-readable side of the same readiness signal.

Draft epic sketch / acceptance:

- Readiness probe fails until `loadAllPlugins` + seeds + asset compression resolve (T09), with a JSON body naming pending jobs.
- Boot emits one structured summary line per init job (module, ok/fail, duration) from the T07 logging.
- `/health/ready` docstring accurately states the checked conditions (T26); operator docs give the LB recipe.
- Deployment topologies epic references the probe contract as the rollout-gate standard.
- A test boots with one failing provider and asserts the probe body names it before any "no provider" symptom.

Priority: high — removes the boot-window 404 class and makes orchestrated deploys safe; all parts already scoped as fixes.

Blocked-by: T07/T09/T26.

Grouping: filed as FEAT (giwt ticket supports `--epic` linking but not epic creation; no new epics cut). High-priority composition group F01-F05.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
