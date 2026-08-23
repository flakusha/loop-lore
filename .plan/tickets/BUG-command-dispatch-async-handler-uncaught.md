<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: dispatchCommand awaits async handler without safety net — a thrown promise becomes a 500 instead of a friendly systemMessage

**Status:** Not Started
**Severity:** medium
**Priority:** medium
**Effort:** small
**Type:** BUG
**Epic:** epic-chat-lifecycle-moderation
**Files:** src/routes/messages/command.ts:118; src/assistant/commands/registry.ts:39

## Issue

`CommandHandler` is typed as `(args, ctx) => CommandResult | Promise<CommandResult>`. `await handler(parsed.args, cmdCtx)` (command.ts:118) will reject if an async handler throws before returning a `CommandResult`. The route layer wraps the dispatch in a `try/catch` that surfaces a 500 to the client.

This violates the pattern documented in command.ts:53-54 (mandating `Promise.allSettled` for unhandled-rejection safety in similar parallel-call contexts).

Async commands (`/battle`, `/attack`, `/heal`, `/caption`, `/create`, `/review`, `/quest`, `/stats`) each have their own internal `try { ... return result }` patterns, but a contributor who forgets the try/catch in a new async command silently degrades UX to a 500. No regression test fences against this.

## Why it matters

New async commands silently degrade to a generic 500 instead of a friendly system message ("Command failed: <reason>"). Every defensive try/catch is a per-command copy-paste burden.

## Evidence

- `src/routes/messages/command.ts:118` — bare `await handler(...)`.
- `src/assistant/commands/registry.ts:39` — `CommandHandler` type allows Promise rejection.
- `BUG-chat-trigger-auto-generation-unhandled-rejection.md` — analogous fix pattern already documented for `triggerAutoGeneration`.

## Concrete fix

1. Wrap the dispatch in a chokepoint try/catch:

   ```typescript
   let result: CommandResult;
   try {
     result = await handler(parsed.args, cmdCtx);
   } catch (error) {
     const msg = error instanceof Error ? error.message : String(error);
     log.error("command handler threw", { command: parsed.command, error: msg });
     result = { handled: true, systemMessage: `**Command failed:** ${msg}`, };
   }
   ```

2. Audit each async command (`/battle`, `/attack`, etc.) — remove redundant inner try/catch where the new chokepoint makes them unnecessary.
3. Add tests: an async handler registered to throw → response 200 with `systemMessage: "**Command failed:** <reason>"`, not 500.

## Tests

- `bun test src/routes/messages/command.test.ts` — add async-throw case.
- Audit: ensure no async command's existing test exercises the catch path (currently all rely on try/catch inside the handler).

## Related

- `BUG-chat-trigger-auto-generation-unhandled-rejection.md` (parallel pattern, different layer).
- `epic-chat-lifecycle-moderation.md`.
