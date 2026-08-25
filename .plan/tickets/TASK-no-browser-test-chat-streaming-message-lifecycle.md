# TASK: No browser test: chat streaming + message lifecycle

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

Confirmed coverage gaps in tests/e2e/flows/browser/: (1) SSE streaming render — stream deltas -> message DOM untested (generation-status container existence only). (2) Message editing/regeneration untested. (3) Rapid chat switching / selectChat race untested (single-selection happy path only, htmx-alpine.browser.ts:476). (4) Music/audio embed rendering untested (also guards the XSS fallback paths from BUG-xss-in-music-embed-fallback-rendering). Add browser flows using mock provider once TASK-browser-test-fixture lands.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
