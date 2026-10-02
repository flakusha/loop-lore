<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

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
