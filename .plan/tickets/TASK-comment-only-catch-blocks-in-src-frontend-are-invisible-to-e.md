<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Comment-only catch blocks in src/frontend are invisible to ESLint no-empty

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** (none — hygiene/self-contained)
**Tags:** frontend, eslint, error-handling, cleanup
**Summary:** Convert 105 comment-only `catch` blocks in `src/frontend/` so ESLint's `no-empty` can actually police them.
**Context:** ESLint's `no-empty` is ACTIVE for the frontend: declared `"no-empty": "error"` at `eslint.config.mjs:122` inside `tsRules`, which the frontend block spreads via `...tsRules` at `eslint.config.mjs:307`. But `no-empty` cannot report a block that contains a comment, so it is structurally blind to the shape this codebase actually uses.

Measured across `src/frontend/**/*.ts` production code:

| Shape | Count | Visible to `no-empty`? |
| --- | ---: | --- |
| truly empty (`catch {}`) | 0 | yes |
| comment-only (`catch { /* ignore */ }`) | 105 | **no** |

Zero of the 105 are in the shape `no-empty` can flag, which is exactly why all 105 currently escape it. The authors wrote justified suppressions as comment-only blocks, and the rule that would police them cannot see them.

Separately, the banned-pattern reporter already runs on every check (`scripts/check/parallel/nonblocking.mjs:69`) and reports these into the check report's `nonBlocking` notes without gating, so the debt is visible but unenforced.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Scope

- Convert each of the 105 comment-only `catch` blocks in `src/frontend/**/*.ts` to either a real `log.warn` (where swallowing the error actually loses something the operator needs) or a genuinely empty `catch {}` (where the suppression is correct and needs no comment).

Judgment is per-site, not mechanical. An empty block that is correct is cheaper than a comment; a comment documenting a real swallowed risk should become a log line. Do not bulk-replace one shape for the other.

## Out of Scope

- Any change to `eslint.config.mjs` rule severities or the frontend override block.
- Comment-only `catch` blocks outside `src/frontend/`.
- Promoting the advisory gate to blocking (separate ticket; needs this debt cleared first).

## Acceptance Criteria

- [ ] Zero comment-only `catch` blocks remain in `src/frontend/**/*.ts` production code (excluding `*.test.ts`).
- [ ] Every conversion is one of: a genuinely empty `catch {}`, or a `log.warn` that names the swallowed error.
- [ ] `no` suppression comment was deleted while losing information a future reader needs — every removed comment either became a log line or was genuinely redundant.
- [ ] The banned-pattern reporter's finding count for this bucket drops to 0 (run `bun scripts/check-frontend-banned-patterns.ts` and quote the before/after counts).
- [ ] `bun run lint:eslint` exits 0, and `no-empty` reports nothing new.
- [ ] `bun test src/frontend/` exits 0.

## Related Files

- `eslint.config.mjs:122` — `no-empty: "error"` in `tsRules`
- `eslint.config.mjs:307` — `...tsRules` spread into the frontend block
- `scripts/check-frontend-banned-patterns.ts` — the reporter that counts these
- `scripts/check/parallel/nonblocking.mjs:67-93` — where findings land
- `.agents/references/banned-patterns.md` — the rule this enforces
