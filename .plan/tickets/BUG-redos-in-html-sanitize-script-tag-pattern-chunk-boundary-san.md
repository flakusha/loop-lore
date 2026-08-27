# BUG: ReDoS in html-sanitize script-tag pattern + chunk-boundary sanitization gap

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

`src/regex/html-sanitize.ts:15` — `SCRIPT_TAG` nested quantifier `(?:(?!<\/script>)<[^<]*)*` backtracks quadratically+ on many `<` with no closing tag; applied via `replaceAll` to untrusted LLM stream output.

`src/generation/auto-gen/stream-render.ts:17-19` — sanitizer applied per-chunk: `<script>` split across boundary never matches and passes through unsanitized into rendered output; also `ON_EVENT_*` covers quoted attrs only (unquoted `onerror=alert(1)>`, `iframe`/`img` vectors survive).

**Fix**:

- Replace the regex with a linear-scan or whitelist-based sanitizer operating on assembled text, not per-chunk strips.
- Cover unquoted event-handler attrs and tag vectors (`iframe`, `img onerror`, etc.).
- Buffer stream output across chunk boundaries before sanitizing.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
