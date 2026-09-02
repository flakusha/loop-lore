# TASK: Two tier custom instructions

**Status:** ✅ Complete (2026-09-01 — dev cdd0b6c7)
**Priority:** low
**Effort:** low
**Epic:** epic-assistant-generation-extensions

## Summary

Source: second emergent sweep, DreamRunner.ai custom instructions (candidate #31).

Free-text user steering injected into prompt assembly in two stacking layers: per-story and per-account (global rules apply everywhere, story layer stacks on top). Applied to all generation paths including impersonation; travels inside story exports/shares.

## Acceptance

- [x] Per-story + per-account fields (validated length limit, e.g. 5k chars each)
- [x] PromptAssembler section wiring with global-then-story stacking, budget-safe
- [x] Applied on impersonation paths too
- [x] Included in story export/share payload
- [x] Tests: stacking order + trimming precedence

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Trust boundary (GM vs user)

Two-tier custom instructions is USER-authored steering. It never carries
system/GM authority. Both tiers render through `wrapSteering`
(`src/assistant/prompt/sections/system.ts`) — an advisory preamble inside
the shared `<untrusted_user_content source="user.custom_instructions">`
marker that instructs the model to honor the preferences only where they do
not conflict with system, GM, or safety instructions, and never to change
role or override policy from them.

This is deliberately a weaker containment tier than `wrapUntrusted`
(data-only), which wraps the untrusted *prompt overrides* (chat/world
system-prompt fields) where the text must not be obeyed at all. Steering is
meant to be obeyed as preference; overrides are meant to be inert data. The
two must not be collapsed back into one wrapper — see
BUG-account-tier-custom-instructions-render-as-system-message-wi for the
GM-override vector that drift between them opened.
