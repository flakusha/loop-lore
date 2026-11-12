<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Browser suite must gate release artifacts

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Status Note:** FIXED (issue 6465282) — local `ci` runs the browser suite between `test:e2e` and `build` and the CI `build` job depends on `test-browser` (10f8e5287); this branch closes the release-path half: `release.yml` + `dev-release.yml` install a Chromium before the gate suite runs, CI installs Chromium without `--with-deps` (the apt font pull fails with DNS errors on the runner image while all 26 shared libraries are already present), the gate-suite job timeouts now outlast the browser gate's own 45-minute budget, and the `wiring - check` gate fails when a workflow JOB runs a browser-backed step without installing a browser first in that same job. Controlled-failure evidence: one injected failing browser file made the suite report `1/51 files failed` and exit 1 (all 50 real spec files green in the same run), so the `&&` chain in `bun run ci` stops before `build`.
**Priority:** high
**Effort:** Small
**Epic:** epic-release-010

## Summary

The browser E2E suite was a parallel test surface, wired into neither the
local nor the CI release gate: a green build artifact could coexist with a
red browser suite, so the release surface was silently under-tested. The
suite is now wired into every release path:

- `package.json:71` — local `ci` runs `test:e2e:browser` between `test:e2e`
  and `build`.
- `.github/workflows/ci.yml` — the `build` job depends on `test-browser`.
- `.github/workflows/release.yml` + `.github/workflows/dev-release.yml` — the
  verify and dev-release jobs install a Chromium before the gate suite runs,
  so the browser gate (`e2e - browser (baseline)`, part of `check:ci`) can
  pass there at all; without the browser it fails with a missing-browser
  error and the release path can never go green.
- CI installs Chromium WITHOUT `--with-deps`: the runner image already ships
  all 26 shared libraries Playwright asks apt for (apt reports every one of
  them already at the newest version), and the extra apt packages it pulls
  are FONT packages whose download fails with DNS errors. The browser specs
  assert DOM state, never rendered pixels.
- The gate-suite job timeouts (45 min in `ci.yml`, 40 min in `release.yml`,
  45 min in `dev-release.yml`) could not outlast the browser gate's own
  45-minute budget, which runs last in the solo tail — the job was killed
  as the gate expired, so the suite could never finish. All three are 90.

## Why

`tests/e2e/` (used by `test:e2e`) does NOT pick up `*.browser.ts` files
(discovered via control probe: `bun test tests/e2e/` ran the colocated
`.test.ts` control but omitted the `.browser.ts` control). The browser
suite is therefore a parallel test surface that must be wired explicitly
into the release gate.

## Where

- package.json scripts (`ci` line 71, `test:e2e:browser` line 55)
- .github/workflows/ci.yml (jobs `test-browser`, `build` — `needs: [test-unit, test-e2e, test-browser]`)
- .github/workflows/release.yml + .github/workflows/dev-release.yml (the gate-suite jobs)
- scripts/check/release-gate-wiring.ts (the `wiring - check` guard) + its colocated test

## Acceptance Criteria

- [x] `bun run ci` invokes the browser suite after `test:e2e` and before `build`.
- [x] The CI `build` job depends on `test-browser` succeeding.
- [x] A controlled failing browser test blocks both local `bun run ci` and the CI build job.
- [x] No regression to existing `test:unit`, `test:e2e`, or `build` ordering.
- [x] The release and dev-release workflows install a browser before the gate suite runs.
- [x] The gate-suite job timeouts outlast the browser gate's own budget.
- [x] The `wiring - check` gate fails when a workflow job runs a browser-backed step without installing a browser first in that same job.


git issue: 6465282
