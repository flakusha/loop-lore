# BUG: ReDoS in html-sanitize script-tag pattern + chunk-boundary sanitization gap

**Status:** 🔧 Partial (ReDoS done; chunk-boundary open)
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

## Open: chunk-boundary sanitization gap

The linear scanner is still applied per-chunk in `renderStreamMessage`; a `<script>…</script>` tag split across two SSE chunks will never have its opening and closing tags matched in the same call, so it passes through unsanitized. Buffering SSE chunks across boundaries before sanitizing is a separate change.

## Open: additional tag/attribute vectors

Unquoted event handlers (`onerror=alert(1)>`), `iframe`/`object`/`embed`/`svg foreignObject`, and `javascript:` URLs in `href`/`src` are not covered by `stripScriptTags()` alone. The prior `7a4c51b8` fix added `DANGEROUS_TAGS` and `JS_URL_ATTR` patterns but scope completeness should be audited separately.

## Acceptance Criteria

- [x] ReDoS portion: quadratic `SCRIPT_TAG` regex replaced with linear scanner (commit `1a15200b`)
- [ ] Chunk-boundary sanitization: buffer SSE chunks before sanitizing (separate ticket to file)
- [ ] Additional tag/attribute coverage audit (separate ticket to file)
- [ ] Documentation updated

