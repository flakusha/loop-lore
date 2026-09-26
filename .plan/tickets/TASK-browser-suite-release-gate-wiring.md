<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Browser suite must gate release artifacts

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small

## Summary

The browser E2E suite is not in the release gate: local `ci` (`package.json:122`)
runs `check:ci && test:unit && test:e2e && build` without `test:e2e:browser`,
and the CI `build` job (`.github/workflows/ci.yml:160`) declares
`needs: [test-unit, test-e2e]` — `test-browser` is not in the dependency
graph. A green build artifact can coexist with a red browser suite, so the
release surface is silently under-tested.

## Why

`tests/e2e/` (used by `test:e2e`) does NOT pick up `*.browser.ts` files
(discovered via control probe: `bun test tests/e2e/` ran the colocated
`.test.ts` control but omitted the `.browser.ts` control). The browser
suite is therefore a parallel test surface that must be wired explicitly
into the release gate.

## Where

- package.json scripts (`ci` line 122, `test:e2e:browser` line 72)
- .github/workflows/ci.yml (jobs `test-browser` line 109-138, `build` line 160)

## Acceptance Criteria

- [ ] `bun run ci` invokes the browser suite after `test:e2e` and before `build`.
- [ ] The CI `build` job depends on `test-browser` succeeding.
- [ ] A controlled failing browser test blocks both local `bun run ci` and the CI build job.
- [ ] No regression to existing `test:unit`, `test:e2e`, or `build` ordering.
