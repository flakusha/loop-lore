# BUG: XSS fail-open when DOMPurify missing

**Status:** ✅ Resolved (already fixed in code: render.ts and chat-generations.ts both fail closed — render.ts escapes source text, chat-generations.ts renders as text)
**Priority:** high
**Effort:** Medium

## Summary

Sanitization is optional in two render paths: src/frontend/alpine/chat/render.ts:16 returns raw content when __marked/__DOMPurify globals missing (consumed by x-html at message-list.html:107,160,165,183); src/frontend/alpine/chat-generations.ts:157 does container.innerHTML = DOMPurify ? sanitize(html) : html with raw LLM SSE content. Vendor load failure -> raw user/LLM markdown injected. Fix: fail closed.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
