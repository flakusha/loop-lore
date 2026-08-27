# TASK: Browser tests: weak interaction coverage in existing flows

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

Browser test flows assert DOM presence but not interaction:

- `chat-flow.browser.ts:39-207` — ~12 of 14 tests are attached-in-DOM checks only, zero interaction; header comment defers toggle/visibility tests that never landed for gallery/character-info panels.
- `auth-flow.browser.ts:88-91` — only wrong-creds validation tested; no successful form-driven login (only demo-link path in `auth-session`).
- `group-chat-matrix.browser.ts:94-118` — turn-order asserted on cold render only, no advancement/regeneration despite `matrix` name.
- `settings-flow.browser.ts:71` — theme change asserted via settings JSON only; never asserts theme class applied to html/body.
- `smoke.browser.ts:191` — locale selector DOM-only.

**Fix**: add interaction assertions (clicks, state transitions, side-effects) to each flow. Keep DOM checks but layer them with one assertion per interaction per flow.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
