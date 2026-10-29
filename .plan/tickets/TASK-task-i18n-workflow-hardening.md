<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: TASK-i18n-workflow-hardening

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-i18n

**Summary:**

Owner epic: `.plan/epics/epic-i18n.md`

## Background

Core i18n Complete (818-key `en.json`, 10 locales): `src/i18n/translator.ts:82-90` (`{param}` interpolation + plural via shared `plurals.ts`); `src/frontend/i18n.ts:26-44` locale registry (ar rtl at `:36`); `src/middleware/i18n.ts:41-59` detection (cookie `ll_locale`, Accept-Language, default; no URL-prefix routing, no DB user locale).
Gate-not-pipeline: `scripts/check/i18n-keys.mjs:5-17` static-key gate (literals must exist in `en.json`) - detects missing keys but does NOT extract/push, no TMS sync, no MT, no pseudo-locale.
User-store gap: `src/db/schema-core.ts:238-252` `Users` has NO locale column (cookie/localStorage only; logged-in locale dies with cookie clear).

Established solutions: Actual Budget extract-strings-to-PR workflow (reuse owned `i18n-keys.mjs` in reverse, zero new services) - https://github.com/jfdoming/actual/blob/master/.github/workflows/i18n-string-extract-master.yml ; ProtonMail validation list (placeholder consistency, length, RTL checks into `i18n:check`) - https://github.com/ProtonMail/proton-i18n/blob/master/Readme.md . Weblate self-host DEFERRED (overshoot for 10-locale catalog); ICU upgrade explicitly NOT in scope.

## Change

1. Extend `scripts/check/i18n-keys.mjs` (already owned): `--report` (missing/extra/stale keys per locale as JSON) + placeholder-consistency check (`{params}` in translation == `{params}` in en) + pseudo-locale generator (`en-XA`: expand + diacritics) for layout tests. No new extractor dep.
2. Migration `0xx_users_locale`: `users.locale TEXT NULL` + backfill from settings JSON where present; `detectLocale`: explicit user setting, cookie, Accept-Language, default; settings PATCH persists both. Anon cookie path unchanged.
3. CI: existing i18n gate stays BLOCKING; placeholder-mismatch BLOCKING, missing-key advisory report artifact. Document Weblate-as-future path in epic.

## Acceptance

- `bun run i18n:check --report` lists a seeded missing key + a seeded `{param}` mismatch; exit codes documented.
- Pseudo-locale renders chat view without clipping at 200 pct text (visual check note).
- Logged-in user locale survives cookie clear (DB column); anon still cookie-driven.
- No ICU dep added; existing 818-key catalogs untouched except backfill.

**Caveats:** TOCTOU: backfill reads settings JSON once per user inside migration transaction. Security: pseudo-locale test-only, never served to real users (dev/test env gate). Authorization: locale PATCH self-only (or admin). Partial failure: per-locale report completes all locales even if one catalog fails to parse. Rollback: locale column nullable + ignored when absent. Stale state: `en-XA` generated from current `en.json` at check time. Observability: `--report` JSON artifact persisted per CI run.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
