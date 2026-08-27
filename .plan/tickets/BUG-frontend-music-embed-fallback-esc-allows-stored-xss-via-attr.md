# BUG: frontend: music-embed fallback esc() allows stored XSS via attribute breakout and javascript: URLs

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/frontend/alpine/chat/music-embed.ts esc() (lines 30-34) uses textContent then getHTML(), which does not escape double quotes; values are interpolated into src= and href= attributes (lines 36, 40). A value containing a double quote breaks out of the attribute. Also no URL scheme validation, so javascript: URLs pass through. The prior XSS fix (14a4f71c) only covered the DOMPurify iframe path. Fix: escape double quote to &quot; and allowlist http(s):/mailto: schemes.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
