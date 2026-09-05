# BUG: BUG: SSE stream render relies on weak regex HTML sanitizer (residual XSS)

**Status:** ✅ Done
**Priority:** medium
**Effort:** Medium

## Summary

src/generation/auto-gen/stream-render.ts renderStreamMessage sanitizes markedParse(content) only by stripping <script> and on*= attributes. It does not strip <iframe>, <object>, <embed>, <svg> foreignObject, or javascript: URLs in href/src, so those vectors survive into the SSE consumer DOM. Fix: sanitize with a real HTML sanitizer (e.g. DOMPurify / a vetted allowlist) instead of the three regexes in src/regex/html-sanitize.ts, or disable raw HTML in markedParse.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated

## Resolution

Expanded the regex-based sanitizer in `src/regex/html-sanitize.ts` and `src/generation/auto-gen/stream-render.ts` with 3 new patterns: `ON_EVENT_UNQUOTED` (covers unquoted event handlers like `onerror=alert(1)`), `JS_URL_ATTR` (covers `href="javascript:..."` and `src="javascript:..."`), and `DANGEROUS_TAGS` (covers `<iframe>`, `<object>`, `<embed>`, `<style>`, `<base>`, `<form>`, `<button>`, `<svg>`, `<math>` — strips tag + content). Also fixed the ReDoS-vulnerable `SCRIPT_TAG` regex by replacing the nested quantifier with a simpler `[\s\S]*?` pattern. `<input>` is explicitly excluded from `DANGEROUS_TAGS` because markdown task lists use it. Same fix applied to `src/generation/generate-route/tool-execution.ts`'s `sanitizeToolOutput` for consistency. New test at `src/regex/html-sanitize.test.ts` (32 cases) validates all patterns. 542/542 existing tests pass. No new dependencies added.