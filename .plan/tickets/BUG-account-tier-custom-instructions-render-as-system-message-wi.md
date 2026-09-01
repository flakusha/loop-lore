# BUG: account-tier custom instructions render as system message without injection preamble - GM override vector

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

cdd0b6c7 two-tier custom instructions: src/assistant/prompt/sections/custom-instructions.ts:55-62 wrapUntrusted emits bare <untrusted_user_content> tag, omitting the data-only safety preamble that system.ts:26-35 uses; the section header says 'Follow these user steering instructions for every reply' and renders role:'system', and reorderPromptMessages splices system messages to the front - so account-tier text (users.settings.customInstructions, invisible to the GM) lands adjacent to the GM system prompt in shared story chats. JSDoc claims 'same marker shape as the system section' - materially false. Fix: share system.ts wrapUntrusted (preamble included), reconcile obey-vs-obey-data semantics for steering, and document the GM-vs-user trust boundary in the two-tier ticket. Found in dev-fix review 2026-09-01.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
