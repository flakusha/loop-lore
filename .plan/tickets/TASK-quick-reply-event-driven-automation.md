# TASK: Quick-Reply / Event-Driven Automation

**Status:** 🟡 In progress — core shipped (ac5b2545, 2026-08-16): buttons + persistence + startup trigger; user/ai event triggers reserved (rate-limit design needed)
**Priority:** medium
**Effort:** Medium

## Summary

0.1.0 Quick Win item 1 (matrix gap G22). Build on shipped infra: slash-command parser (21 handlers, messages.ts:543), generation hooks (src/generation/hooks/: HookEventType/HookContext/HookChainResult registry + e2e test), regex pipeline. Scope: (a) quick-reply button sets rendered on messages (SillyTavern QR / RisuAI dynamic inspiration); (b) event triggers auto-execute actions on startup/user/ai events (event-driven automation); (c) thin route + pure frontend; no new infra. Effort Med. Acceptance: button set config persisted, click executes slash command, auto-execute hooks fire on specified events, unit tests green.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
