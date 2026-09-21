<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: lore-load.ts: db + eb use  instead of Kysely + ExpressionBuilder

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

**Summary**: src/assistant/prompt/sections/lore-load.ts (extracted from lore.ts in TASK-world-lore-lifecycle-confidence-decay-distortion) declares  and  in the WHERE callback. This violates .agents/references/banned-patterns.md ( is prohibited) and the route-ctx-typing skill (typed Ctx via AssembleContext, Kysely<DB>).\n\n**Context**: Sibling file lore-identity.ts uses  for the db handle and  for the where callback. lore-load.ts was written during a refactor to keep lore.ts under the 250L size-strict ceiling; the typed ctx parameter was dropped to keep the function signature minimal.\n\n**Acceptance Criteria**:\n- lore-load.ts no longer contains  keyword\n- loadLore signature accepts  (or the typed subset thereof: )\n- The eb callback is typed as  (for the first query; the second selects from ; either inline the eb type per query or split)\n- Existing 16 lore.test.ts assertions + 25 lifecycle.test.ts assertions still pass\n- gpg-precheck: warm (silent sign verified, ttl 28800s, key E9DAF69C...)
=== loop-lore parallel check runner ===
Running 29 checks with concurrency=8 (override via --jobs N or CHECK_JOBS=N)...

PASS: typecheck - backend
PASS: typecheck - frontend
PASS: typecheck - coverage
PASS: typecheck - coverage - frontend
PASS: typecheck - scripts
PASS: lint - eslint
PASS: lint - oxlint (correctness)
PASS: format - dprint
PASS: md - lint
PASS: mermaid - lint (mmdlint)
PASS: dead - code (knip)
PASS: circular - imports (advisory)
PASS: wiring - check
PASS: fe-be - harmony (advisory)
PASS: changelog - gate
PASS: db - schema gate
PASS: migrations - ordering
PASS: backlog - index
PASS: code-map - freshness
PASS: plan - validate
PASS: size - check
PASS: size - strict
PASS: context - weight
PASS: no - shell - refs
PASS: frontend - innerHTML xss
PASS: frontend - banned patterns (ESLint-gap heuristic — advisory)
PASS: plan - epic coverage (advisory)
PASS: plan - ticket index (sync)
PASS: coverage - per-module line %

=== Summary ===
Total: 29
Passed: 29
Failed: 0

=== Non-blocking checks ===
warn: Code duplication detected (jscpd:full): 2866 clones, 7.84% dup lines (first run: baseline recorded)
  Full report: .tmp/run-1935793-mubc5k4d/jscpd/jscpd-report.json
OK: Markdown links OK
  [license] Running license compliance checks...
  [license] Neither scancode nor fossa installed - skipping

Check report: /home/flak/git-ai/loop-lore/tree/lore-lifecycle-followup/.tmp/check-report.json
CHECK_REPORT_PATH=/home/flak/git-ai/loop-lore/tree/lore-lifecycle-followup/.tmp/check-report.json
CHECK_REPORT_LATEST=/home/flak/git-ai/loop-lore/tree/lore-lifecycle-followup/.tmp/check-report.latest.json
CHECK_REPORT_RUN_ID=1935793-mubc5k4d
CHECK_REPORT_JSCPD=/home/flak/git-ai/loop-lore/tree/lore-lifecycle-followup/.tmp/run-1935793-mubc5k4d/jscpd/jscpd-report.json

=== All checks passed === passes\n\n**Status**: Open\n**Priority**: Medium\n**Effort**: Small

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
