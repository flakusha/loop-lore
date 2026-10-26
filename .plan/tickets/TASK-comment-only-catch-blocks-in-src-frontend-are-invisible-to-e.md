<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Comment-only catch blocks in src/frontend are invisible to ESLint no-empty

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** (none — hygiene/self-contained)
**Tags:** frontend, eslint, error-handling, cleanup
**Summary:** Convert the 120 comment-only `catch` blocks in `src/frontend/` production code (124 including tests, measured 2026-10-26) so ESLint's `no-empty` can actually police them.
**Context:** ESLint's `no-empty` is ACTIVE for the frontend: declared `"no-empty": "error"` at `eslint.config.mjs:122` inside `tsRules`, which the frontend block spreads via `...tsRules` at `eslint.config.mjs:307`. But `no-empty` cannot report a block that contains a comment, so it is structurally blind to the shape this codebase actually uses.

Measured across `src/frontend/**/*.ts` production code (brace-aware census, 2026-10-26; the earlier "105" was never reproducible and matched no measurable subset):

| Shape | Count | Visible to `no-empty`? |
| --- | ---: | --- |
| truly empty (`catch {}`) | 0 | yes |
| comment-only (`catch { /* ignore */ }`) | 120 (124 including `*.test.ts`) | **no** |

Zero of the 120 are in the shape `no-empty` can flag, which is exactly why all of them currently escape it. The authors wrote justified suppressions as comment-only blocks, and the rule that would police them cannot see them.

NOTE: the banned-pattern reporter does NOT cover this debt. `scripts/check-frontend-banned-patterns.ts` buckets are void-fire-forget, fetch-no-catch, storage-no-try, eval-usage and listener-leak — there is no catch bucket, so its findings say nothing about comment-only catches. (An earlier revision of this ticket claimed the reporter reported these into the check report's `nonBlocking` notes; that claim was false and has been removed.) Enforcement for this ticket comes from the census criterion below, not from the reporter.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Scope

- Convert each of the 120 comment-only `catch` blocks in `src/frontend/**/*.ts` (production code; 124 including tests are tracked but out of scope) to either a real `log.warn` (where swallowing the error actually loses something the operator needs) or a genuinely empty `catch {}` (where the suppression is correct and needs no comment).

Judgment is per-site, not mechanical. An empty block that is correct is cheaper than a comment; a comment documenting a real swallowed risk should become a log line. Do not bulk-replace one shape for the other.

## Out of Scope

- Any change to `eslint.config.mjs` rule severities or the frontend override block.
- Comment-only `catch` blocks outside `src/frontend/`.
- Promoting the advisory gate to blocking (separate ticket; needs this debt cleared first).

## Acceptance Criteria

- [ ] Zero comment-only `catch` blocks remain in `src/frontend/**/*.ts` production code (excluding `*.test.ts`).
- [ ] Every conversion is one of: a genuinely empty `catch {}`, or a `log.warn` that names the swallowed error.
- [ ] `no` suppression comment was deleted while losing information a future reader needs — every removed comment either became a log line or was genuinely redundant.
- [ ] The comment-only catch census (a repeatable, brace-aware count over `src/frontend/**/*.ts` production code — the 2026-10-26 baseline is 120; the census used for the measurement must be quoted in the closing note) reports 0 after the conversion. NOTE: this REPLACES an earlier criterion that asked for the banned-pattern reporter's bucket count to drop to 0 — that reporter has no catch bucket, so the old criterion was unsatisfiable as written.
- [ ] `bun run lint:eslint` exits 0, and `no-empty` reports nothing new.
- [ ] `bun test src/frontend/` exits 0.

## Related Files

- `eslint.config.mjs:122` — `no-empty: "error"` in `tsRules`
- `eslint.config.mjs:307` — `...tsRules` spread into the frontend block
- `scripts/check-frontend-banned-patterns.ts` — the advisory reporter; has NO catch bucket (listed for orientation only, it does not count these)
- `scripts/check/parallel/nonblocking.mjs:67-93` — where findings land
- `.agents/references/banned-patterns.md` — the rule this enforces
