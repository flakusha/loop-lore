<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Three pagination sites still parse a limit by hand, so LIMIT -1 returns the whole table and a bad limit is a 500

**Status:** Done
**Status Note:** [2026-10-28 triage] FIXED — filed against the 2026-10-25 triage snapshot, but the parallel fixes landed first: `d5dec33aa` (character-mood/events.ts:109-112), `675b57cec` (nsfw-moderation/appeals.ts:100-103) and `0c48e1cb5` (story-turns.ts:67-70) now route all three sites through the shared `parsePaginationParams` helper, so `LIMIT -1` and a non-numeric limit are rejected by the shared clamp instead of being parsed by hand. No further work.
**Priority:** medium
**Effort:** Small
**Epic:** epic-api-validation-guardrails
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Three routes parse their pagination limit by hand instead of using the shared helper, so ?limit=-1 returns the whole table and a non-numeric limit becomes a 500 with the raw SQLite driver text.

## Summary

Same defect class as the already-fixed BE-5 sites, which were routed through the shared parser parsePaginationParams (src/routes/http-utils/parse.ts:105-141). Three sites were missed:

- src/routes/character-mood/events.ts:101 — const limit = ctx.query.limit; is passed raw into moodService.getEvents -> .limit(limit) (src/characters/services/mood-service/get-events.ts:41). The route has no query: schema, so ?limit=-1 returns the whole table and ?limit=abc is a 500 with the raw driver text.
- src/routes/nsfw-moderation/appeals.ts:100 — Math.min(Math.max(Number(ctx.query.limit ?? 50), 1), 100). Number("abc") is NaN and NaN survives the Math clamp, so ?limit=abc becomes LIMIT NaN and a datatype mismatch 500. The route schema is t.Optional(t.String()), which accepts "abc".
- src/routes/story-turns.ts:67-68 — parseIntOr(searchParams.get("page") ?? "1", 1) / pageSize. The route has no query: schema and parseIntOr only rejects non-integers, so ?pageSize=-1 is accepted and becomes LIMIT -1 (whole table). Its offset is also unguarded.

## Scope

Route all three through the existing shared helper parsePaginationParams in src/routes/http-utils/parse.ts and give each route the matching query: schema. Do not add a second parser.

## Acceptance Criteria

- [ ] src/routes/character-mood/events.ts parses its limit through parsePaginationParams and declares a query: schema.
- [ ] src/routes/nsfw-moderation/appeals.ts parses its limit through parsePaginationParams; ?limit=abc returns 400, not 500.
- [ ] src/routes/story-turns.ts parses page/pageSize through parsePaginationParams; ?pageSize=-1 returns 400 and the offset is bounded.
- [ ] Tests passing
- [ ] bun run check passes

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
