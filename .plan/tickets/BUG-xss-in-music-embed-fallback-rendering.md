<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: XSS in music embed fallback rendering

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Resolved (commit 14a4f71c — esc() helper escapes fallback card values; fail-closed on missing DOMPurify)
**Priority:** high
**Effort:** Medium

## Summary

src/frontend/alpine/chat/music-embed.ts builds fallback card via unescaped string concat (L29-37): thumbnailUrl/title/artist/serviceUrl interpolated raw into HTML rendered via x-html in src/components/chat/message-list.html:232. LLM/regex-extracted metadata -> stored XSS (`<img onerror>`, `javascript:` href). Also L40-44: returns msg.embedHtml raw when DOMPurify missing — sanitizer must fail closed (placeholder), not open.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
