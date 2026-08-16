<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Quick-Reply / Event-Driven Automation

**Status:** ✅ Done 2026-08-16 — core (buttons + persistence + startup trigger, ac5b2545) **+ user/ai event triggers & loop-guard** (`chat-quick-replies.ts` `fireAutoQuickReplies`, `_autoFired` human-send discrimination, 3s min-interval, consecutive cap 5; wired into `sendMessage` + SSE `stream-done`). Tests green (`chat-quick-replies.test.ts` 9 cases).
**Priority:** medium
**Effort:** Medium

## Summary

0.1.0 Quick Win item 1 (matrix gap G22). Build on shipped infra: slash-command parser (21 handlers, messages.ts:543), generation hooks (src/generation/hooks/: HookEventType/HookContext/HookChainResult registry + e2e test), regex pipeline. Scope: (a) quick-reply button sets rendered on messages (SillyTavern QR / RisuAI dynamic inspiration); (b) event triggers auto-execute actions on startup/user/ai events (event-driven automation); (c) thin route + pure frontend; no new infra. Effort Med. Acceptance: button set config persisted, click executes slash command, auto-execute hooks fire on specified events, unit tests green.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated
