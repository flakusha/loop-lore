# TASK: Assistant Commands Extension

**Status:** 🟡 In Progress — parser + 21 handlers wired; tiered access (owner-gated) shipped (worktree `assistant-intent-workflows`, `eb2d50b`); `/stats` `/attack` `/heal` handlers + `/create` singleton bug open (2026-08-16)
**Priority:** medium
**Effort:** Medium
**Epic:** epic-assistant-gm-flows

## Summary

Slash command system: parser (`src/assistant/command-parser.ts`), dispatch in `POST /api/chats/:id/messages` (`src/routes/messages.ts:543`), and 21 registered handlers (roll/dice, help, improve, image, impersonate+char, narrate, ooc, quest, summarize+sum, sfx+sound, video, music, caption, create, context, debug, detail, review). Command buttons (`src/frontend/alpine/command-buttons.ts`) insert slash text into the input → parsed server-side.

## Remaining

- [x] Tiered access control — shipped: `registerCommand` takes optional `requiredRole` (`observer < member < owner` hierarchy); dispatch resolves `chat_participants.role_in_chat` and denies below-minimum. `/create` + `/debug` now `owner`-only. "GM" tier dropped — no such participant role exists (assistant role is a chat config, not a permission).
- [ ] `/stats`, `/attack`, `/heal` not registered (in `BUILTIN_COMMANDS` spec list, no handler)
- [ ] `/create` uses `loadConfig()`/`getDatabase()` singletons + `worldId = chat.type` bug — see TASK-assistant-gm-flows
- [ ] Integration tests for slash dispatch → command result
- [ ] Docs: `docs/spec/assistant-commands.md` refresh

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
