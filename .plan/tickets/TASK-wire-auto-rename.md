# TASK: Wire auto-rename into message pipeline

**Status:** ✅ Done
**Priority:** High
**Effort:** Small
**Epic:** epic-logic-reconciliation

## Summary

`generateRuleName()` and `buildRenamePrompt()` in `src/chat/auto-rename.ts` are fully implemented but never called. Chats are never auto-renamed after the first message.

## Current State

- `generateRuleName()` — rule-based: extracts character name + location/topic
- `buildRenamePrompt()` — LLM-based: sends first messages to LLM for title generation
- Both exported from `chat/index.ts`
- Never imported by any route or service

## Fix

In `routes/messages.ts` POST `/api/chats/:id/messages`:

1. After first user message is saved, check if chat name is default ("New Chat")
2. If so, call `generateRuleName()` with character name, location, and first message
3. If rule-based name is insufficient, optionally call LLM via `buildRenamePrompt()`
4. Update chat name via `updateChat()`

## Acceptance Criteria

- [ ] Chats auto-renamed after first user message
- [ ] Rule-based rename uses character name + topic
- [ ] Tests pass: `bun test src/chat/ src/routes/`
