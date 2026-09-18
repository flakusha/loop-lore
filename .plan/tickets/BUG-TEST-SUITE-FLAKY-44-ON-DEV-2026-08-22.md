<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->


# BUG-TEST-SUITE-FLAKY-44-ON-DEV-2026-08-22: Closeout — Resolved by post-Aug-22 commits

**Status**: closed
**Priority**: medium
**Labels**: bug, bookkeeping
**Epic**: (none)
**Closed at**: 2026-09-18
**Related**: git issue 1e5d5dc

**Effort**: Trivial (bookkeeping only — no code change)

**Summary**: 2026-08-22 repro at dev HEAD `c18d6bfb` reported 31 fail + 10 errors across 5 clusters (A hot-reload, B age-gate, C auth, D asset metadata, E telemetry + admin model-roles). Root cause attributed to migration gap (`007_add_chat_gm_role`, `008_memory_source_chain`) plus pre-existing test debt. Both migration files now exist on dev (`9acc931fc` brought in the rest of the deps). Every cluster was re-verified on dev HEAD `7ae39fcfb` (2026-09-18) and now passes.

**Context**: Ticket was filed as a sweep capturing a moment-in-time dev breakage. The original clusters all healed via unrelated test/migration commits that landed between Aug-22 and Sep-18 (e.g. `fix(check): skip slow migration tests by default in coverage gate`, `fix(test): honor TEST_JOBS env var`, `fix(test): parallelize bun test invocations`, plus per-domain fixes for NSFW singleton reset, jest stub types, fakeResponse types, etc.).

**Acceptance Criteria**:
- [x] Cluster A (hot-reload): `src/config/hot-reload.test.ts` — 4 tests pass under `bun run test:unit` (the project's actual gate); the describe-level `describeOrSkip` only fires under `ISOLATED=true` (set by the `test:unit` npm script), so direct `bun test` invocation skips as a footgun, not a failure.
- [x] Cluster B (age-gate): `src/age-gate/controller.test.ts` — 34 pass / 0 fail.
- [x] Cluster C (auth): `src/middleware/auth.test.ts` — 15 pass / 0 fail.
- [x] Cluster D (asset metadata): `src/assets/metadata.test.ts` — 12 pass / 0 fail.
- [x] Cluster E (telemetry + admin model-roles): `src/telemetry/telemetry.test.ts` + `src/routes/admin/model-roles.test.ts` — 17 pass / 0 fail.
- [x] Project gate (`bun run test:unit` on dev): 11495 pass / 0 fail / 1 skip (unrelated `transferOwnership > bad_request` skip).
- [x] Git issue `1e5d5dc` closed.

**Repro evidence** (2026-09-18, dev HEAD `7ae39fcfb`):

```bash
# Cluster A (under test:unit gate; raw bun test skips the describe block)
$ bun run test:unit | grep -c 'Domain Config Hot-Reload'
# (covered by the 11495-pass summary)

# Cluster B
$ bun test src/age-gate/controller.test.ts
# 34 pass, 0 fail

# Cluster C
$ bun test src/middleware/auth.test.ts
# 15 pass, 0 fail

# Cluster D
$ bun test src/assets/metadata.test.ts
# 12 pass, 0 fail

# Cluster E
$ bun test src/telemetry/telemetry.test.ts src/routes/admin/model-roles.test.ts
# 17 pass, 0 fail across both files

# Full project gate
$ bun run test:unit
# 11495 pass, 1 skip, 0 fail, 45194 expect() calls
```
