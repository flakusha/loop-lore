<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->


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
**Epic:** epic-security-sandboxing.md
**Tags:** security-sandboxing
# BUG: ReDoS in HTML sanitizer — script tag pattern vulnerable to chunk-boundary attack (already fixed with streaming sanitizer)

**Status:** Done
**Priority:** high
**Effort:** Small
**Epic:** epic-api-validation-guardrails
**Summary:** `src/regex/html-sanitize.ts` (via `src/regex/html-sanitize-core.ts`) applies `sanitizeHtml` per chunk in the SSE streaming path. When a `<script>...</script>` tag pair is split across two SSE chunks, the per-chunk `sanitizeHtml` processes chunk 1's raw `<script>alert(1)` (no closer) and emits it unsanitized, then chunk 2's `</script>` closes the tag client-side. `src/regex/html-sanitize-streaming.ts` (introduced to fix this) provides `createStreamingSanitizer` which holds back incomplete tag openers until the matching closer arrives.
**Context:** Found 2026-08-25 security review. `src/generation/auto-gen/call-llm.ts` imports `createStreamingSanitizer`. `src/regex/html-sanitize-streaming.test.ts` explicitly tests the chunk-boundary attack. The fix is already in place.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Git Issue:** b465c08

## What

- `src/regex/html-sanitize-core.ts` exports `sanitizeHtml` — the per-chunk sanitizer.
- `src/regex/html-sanitize-streaming.ts` exports `createStreamingSanitizer` — the fix, which holds back unclosed dangerous tag openers across chunk boundaries.
- `src/regex/html-sanitize-streaming.test.ts:31` explicitly names this bug: "defends the canonical BUG-redos chunk-boundary attack".
- `src/generation/auto-gen/call-llm.ts:30` imports `createStreamingSanitizer` for the streaming generation path.
- `src/regex/html-sanitize-streaming.edge.test.ts` tests edge cases including mid-tag-name splits.

## Why

The fix is implemented but there is no explicit test asserting that the old per-chunk path (without `createStreamingSanitizer`) would fail the chunk-boundary attack. A regression test should confirm the attack vector is blocked by the streaming sanitizer.

## Scope

- Add a test to `src/regex/html-sanitize-streaming.test.ts` that explicitly passes `<script>alert(1)` as chunk 1 and `</script>` as chunk 2 to the streaming sanitizer, asserting the output contains neither raw script tag.
- Verify `createStreamingSanitizer` is used in all streaming HTML sanitization paths (grep for `sanitizeHtml` in streaming contexts).
- Out of scope: modifying the core `sanitizeHtml` function (already correct for single-chunk input).

## Acceptance Criteria

- [x] Streaming sanitizer test explicitly blocks the `<script>alert(1)</script>` split-across-chunks attack
- [x] `createStreamingSanitizer` is confirmed in all streaming HTML paths via grep
- [x] `bun test src/regex/html-sanitize-streaming.test.ts src/regex/html-sanitize-streaming.edge.test.ts` green
