# TASK: Frontend sanitize fallbacks inject raw HTML when lib missing

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/frontend/alpine/chat-generations.ts:156 falls back to raw html if DOMPurify absent; src/components/chat/message-list.html x-html renderMarkdown without guaranteed sanitize; src/frontend/asset-preview.ts:35 innerHTML of server partial unsanitized. Fix: fail-safe sanitize; never rely on lib presence. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
