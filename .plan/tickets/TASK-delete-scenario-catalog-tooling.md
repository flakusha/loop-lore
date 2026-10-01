<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Delete unused, broken scenario-catalog tooling

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-code-quality.md
**Tags:** cleanup

## Summary

`scripts/check-scenario-catalog.ts` exits 1 because pillar `i18n` is unknown (verified 2026-09-26: `bun run sc` reports `[UNKNOWN] i18n` and `FAILURES: unknown pillar ids: i18n`). The catalog, generator, checker, and `sc`/`sc:gen`/`sc:gate` package commands have NO consumer outside their own scripts and a script-map entry. The tooling is neither trustworthy nor release-enforced.

## Where

- tests/e2e/scenario-catalog.json
- scripts/check-scenario-catalog.ts
- scripts/gen-scenario-catalog.ts
- package.json scripts (lines 33-35)
- docs/giwt-scripts-map.md (script-map entry)

## Acceptance Criteria

- [ ] `tests/e2e/scenario-catalog.json`, `scripts/check-scenario-catalog.ts`, `scripts/gen-scenario-catalog.ts` are deleted.
- [ ] `sc`, `sc:gen`, `sc:gate` package commands are removed.
- [ ] script-map entry is removed.
- [ ] `bun run check` does not reference scenario-catalog tooling.
- [ ] No regression to standard `bun test tests/e2e/` or `bun run test:e2e:browser`.


git issue: 60449a6
