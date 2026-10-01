<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# IDEA: IDEA regex precision telemetry: opt-in per-pattern match counters

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Tags:** idea, regex, observability
**Context:** Regex extraction pipeline (src/regex/) has no production visibility into false-positive rates; intent-hijack bugs (git issue 9bb9cbf) surface only via user reports.

## Summary

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# IDEA: Regex pattern precision telemetry (opt-in match logging)

**Status:** Not Started
**Priority:** P3
**Effort:** Medium
**Epic:** epic-aux-enrichment-pipeline.md
**Summary:** `src/regex/` has no visibility into false-positive rates in production; intent hijacks (git issue 9bb9cbf) are found by accident. Add opt-in per-pattern match counters so precision problems show up in telemetry before users report them.
**Acceptance Criteria:** (see below)
**Tags:** idea, regex, observability
**Related:** src/regex/safe-exec.ts, src/regex/intent.ts, git issue 9bb9cbf

## Summary

Every consumer calls `safeRegexExec`/`safeRegexMatch` but nothing counts
*matches vs invocations* per pattern. The `9bb9cbf` class of bug (assistant
intent regexes hijacking normal chat) is invisible until a user complains.
A tiny opt-in counter — pattern name → {calls, matches} — flushed through
the existing telemetry pipeline would let precision regressions surface as
data (match-rate spike on `INTENT_PATTERNS` after a pattern edit).

## Acceptance Criteria

- [ ] `safe-exec.ts` gains an opt-in counter hook (off by default; zero cost when disabled)
- [ ] Counters cover at least `intent.ts`, `action-parser.ts`, `memory-classification.ts`
- [ ] Telemetry emission reuses the existing telemetry service (no new endpoint)
- [ ] Documented in `docs/spec/regex-extraction.md` usage-notes section; no PII logged (pattern names + counts only)

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
