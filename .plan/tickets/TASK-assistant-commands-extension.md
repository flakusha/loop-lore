# TASK: Assistant Commands Extension

**Status:** 🟡 In Progress — parser + 21 handlers wired; tiered access pending (2026-08-01)
**Priority:** medium
**Effort:** Medium
**Epic:** epic-assistant-gm-flows

## Summary

Slash command system: parser (`src/assistant/command-parser.ts`), dispatch in `POST /api/chats/:id/messages` (`src/routes/messages.ts:543`), and 21 registered handlers (roll/dice, help, improve, image, impersonate+char, narrate, ooc, quest, summarize+sum, sfx+sound, video, music, caption, create, context, debug, detail, review). Command buttons (`src/frontend/alpine/command-buttons.ts`) insert slash text into the input → parsed server-side.

## Remaining

- [ ] Tiered access control (all/member/GM) — not implemented; all commands run for any authenticated user
- [ ] `/stats`, `/attack`, `/heal` not registered (in `BUILTIN_COMMANDS` spec list, no handler)
- [ ] `/create` uses `loadConfig()`/`getDatabase()` singletons + `worldId = chat.type` bug — see TASK-assistant-gm-flows
- [ ] Integration tests for slash dispatch → command result
- [ ] Docs: `docs/spec/assistant-commands.md` refresh

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
