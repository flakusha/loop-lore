# BUG: BUG: SSE stream render relies on weak regex HTML sanitizer (residual XSS)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/generation/auto-gen/stream-render.ts renderStreamMessage sanitizes markedParse(content) only by stripping <script> and on*= attributes. It does not strip <iframe>, <object>, <embed>, <svg> foreignObject, or javascript: URLs in href/src, so those vectors survive into the SSE consumer DOM. Fix: sanitize with a real HTML sanitizer (e.g. DOMPurify / a vetted allowlist) instead of the three regexes in src/regex/html-sanitize.ts, or disable raw HTML in markedParse.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
