<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: ReDoS in html-sanitize script-tag pattern + chunk-boundary sanitization gap

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ ReDoS + chunk-boundary RESOLVED (commits `1a15200b`, `42ffc7643`); tag/attr coverage audit remains open as a separate ticket (deferred 2026-09-18)

## Handoff (deferred to dedicated worktree)

**ReDoS leg — DONE** (commit `1a15200b`):
Linear `stripScriptTags()` scanner replaces the quadratic nested-quantifier
regex. Test at `src/regex/html-sanitize.test.ts` regresses the
`'<script'.repeat(40_000)` case.

**Open legs — deferred to dedicated worktree** (out of scope for the
`find-work-batch-tickets` batch per user direction 2026-09-18):

1. **Chunk-boundary sanitization**
   - `src/generation/auto-gen/stream-render.ts:17-19` still applies the
     linear scanner per-chunk. A `<script>…</script>` tag split across
     two SSE chunks slips through (opening in chunk N, closing in N+1).
   - Suggested approach: maintain a 1-chunk tail buffer per stream;
     re-scan the tail when a chunk boundary is detected. Buffer cap
     should be ≤ the longest plausible HTML tag (8 KiB is generous).
   - Test fixture: feed chunks where the boundary falls inside `<script>`
     open + close tags; assert the concatenated output is sanitized.

2. **Tag/attribute coverage audit**
   - `stripScriptTags()` covers `<script>`. `DANGEROUS_TAGS` covers
     `iframe`/`object`/`embed`/`svg foreignObject`. `JS_URL_ATTR` covers
     `href`/`src` with `javascript:` URLs in quoted attrs.
   - Open: unquoted event handlers (`onerror=alert(1)>`), `data:` URLs,
     `style` attr with `expression(…)`, mixed-case evasion
     (`<ScRiPt>` is already normalized, verify). The existing patterns
     may already cover these; a regression test sweep is the right next
     step before adding more patterns.

**Why deferred**: per user direction 2026-09-18. Chunk-boundary work
touches the streaming output surface and needs e2e coverage; the
scope is too large for a single-batch worktree alongside unrelated
fixes.
**Priority:** high
**Effort:** Medium

## Summary

`src/regex/html-sanitize.ts:15` — `SCRIPT_TAG` nested quantifier `(?:(?!<\/script>)<[^<]*)*` backtracks quadratically+ on many `<` with no closing tag; applied via `replaceAll` to untrusted LLM stream output.

`src/generation/auto-gen/stream-render.ts:17-19` — sanitizer applied per-chunk: `<script>` split across boundary never matches and passes through unsanitized into rendered output; also `ON_EVENT_*` covers quoted attrs only (unquoted `onerror=alert(1)>`, `iframe`/`img` vectors survive).

## Resolution (ReDoS — landed in 1a15200b)

The ReDoS vulnerability was fixed by replacing the quadratic nested-quantifier `SCRIPT_TAG` regex with a linear left-to-right scanner (`stripScriptTags()`).

**Fixed:**
- ReDoS via `stripScriptTags()` linear scanner replaced the `SCRIPT_TAG` regex whose nested quantifier `(?:(?!<\/script>)<[^<]*)*` backtracked quadratically on inputs with many `<` characters and no closing tag.
- The `[\s\S]*?` from commit `7a4c51b8` was re-replaced because the nested-quantifier hazard remained even with the non-greedy quantifier.
- Exact files changed: `src/regex/html-sanitize.ts`, `src/regex/index.ts`, `src/generation/auto-gen/stream-render.ts`, `src/generation/generate-route/tool-execution.ts`.
- Test added: `src/regex/html-sanitize.test.ts` with a regression case using `'<script'.repeat(40_000)` that must complete in linear time.
- Commit hash: `1a15200b`.

## RESOLVED: chunk-boundary sanitization gap (42ffc7643)

The per-chunk gap described below is closed — see the Resolution block at the Acceptance Criteria. Historical description:

The linear scanner is still applied per-chunk in `renderStreamMessage`; a `<script>…</script>` tag split across two SSE chunks will never have its opening and closing tags matched in the same call, so it passes through unsanitized. Buffering SSE chunks across boundaries before sanitizing is a separate change.

## Open: additional tag/attribute vectors

Unquoted event handlers (`onerror=alert(1)>`), `iframe`/`object`/`embed`/`svg foreignObject`, and `javascript:` URLs in `href`/`src` are not covered by `stripScriptTags()` alone. The prior `7a4c51b8` fix added `DANGEROUS_TAGS` and `JS_URL_ATTR` patterns but scope completeness should be audited separately.

## Acceptance Criteria

- [x] ReDoS portion: quadratic `SCRIPT_TAG` regex replaced with linear scanner (commit `1a15200b`)
- [x] Chunk-boundary sanitization: resolved by `42ffc7643` (see Resolution below)
- [ ] Additional tag/attribute coverage audit (remains open — unquoted event handlers, `data:` URLs, `style` expression audit not yet swept)
- [ ] Documentation updated

## Resolution (chunk-boundary leg — landed in 42ffc7643)

Fixed in dev by `42ffc7643` (fix(regex): close streaming sanitizer boundary leaks). Verified 2026-09-18:

- `src/regex/html-sanitize-streaming.ts` — `findEarliestUnclosedDangerousOpen()` scanner rewritten: (1) partial dangerous-name prefix at end-of-input held from its `<`, closing the `<scr`+`ipt>` split the old rescan window missed; (2) non-dangerous tags advance past NAME only, so a `<script` opener hidden in a preceding tag's attribute region is no longer jumped over; (3) incomplete closers (`</script` without `>`) no longer release the held opener.
- Tests: `src/regex/html-sanitize-streaming.edge.test.ts` — two previously leak-pinning edge tests repinned to hold-back behavior; new acceptance tests for cross-boundary openers, bare trailing `<`, `<styl`+`e>`, hidden openers, late closers. `src/regex/html-sanitize.test.ts` ReDoS regression hardened (200k reps + wall-clock bound).
- Differential property sweep (throwaway, 8 attack strings × every split position, 1061 checks) reported 0 violations.


## Verification (2026-09-20, this worktree)

Re-verified against current dev (`609e5a45b`):

- `bun test src/regex/` — 738 pass, 0 fail, 1132 expect() calls across 21 files. ReDoS regression (`'<script'.repeat(40_000)`) and chunk-boundary tests both green.
- ReDoS + chunk-boundary work landed in commits `1a15200b` (linear scanner) and `42ffc7643` (boundary hold-back + differential sweep).

The open leg (tag/attribute coverage audit) is a separate sweep that was explicitly deferred per user direction 2026-09-18. It does not block the resolved legs; the main attack vectors (`<script>`, `</script>`, chunk-split openers) are closed.

