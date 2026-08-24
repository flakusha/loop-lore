# TASK: Character/world prompt overrides injected verbatim as system role

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/assistant/prompt-assembler.ts:54-100 and prompt/sections/system.ts:18 inject actor.system_prompt, chat.prompt_override, world system_prompt_override as system role with no sandbox. Untrusted char-card/world data becomes trusted instruction. Fix: separate system from untrusted data; wrap untrusted content with do-not-obey markers. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
