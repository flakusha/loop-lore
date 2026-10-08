<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: CI: no check gate executes scripts/** smoke tests

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

WHAT
No registered check gate executes any test under scripts/. The behavioural smoke tests scripts/generate-schema-fuzz.smoke.test.ts and scripts/check-db-schemas.smoke.test.ts pass only when a human runs bun test manually; CI never runs them.

EVIDENCE
The full gate registry in scripts/check/parallel/gates.mjs contains no bun test command (verified by inspecting every gate command in the check report during post-commit verification of bf091441e). The only test-running gate in the runner, coverage - per-module line %, builds its file list via walkTestFiles over src/ plus the plain tests/e2e/ dir, so scripts/** is invisible to it (see scripts/check/parallel/context.mjs, SCOPED_COVERAGE_PATHS / walkTestFiles).

IMPACT
scripts/generate-schema-fuzz.smoke.test.ts (added in bf091441e on feat-api-surface-docs) is the behavioural regression guard for the blocking import-guard fix in bf5c45caa: the fuzz generator dynamic import() had no try/catch, so a route module throwing at import time crashed the generator, which IS the blocking CI gate fuzz - generated tests. With no gate running the test, a future revert of the try/catch (the importFailures++ guard) in scripts/generate-schema-fuzz.ts would land CI-green. scripts/check-db-schemas.smoke.test.ts shares the identical gap.

FIX DIRECTION
Add a light gate (e.g. test - scripts running bun test scripts/) to the checks table in scripts/check/parallel/gates.mjs, or widen test-discovery scope so scripts/** is covered. Constraints:
- Respect the check-runner serialization rule for test processes: two concurrent bun test processes OOM this host (AGENTS.md check-runner notes); any new test-running gate must respect that.
- Keep the gate OUT of ADVISORY_GATES: it guards a blocking fix, so a failure must block.
Both smoke suites are fast, so a dedicated gate is cheap.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
