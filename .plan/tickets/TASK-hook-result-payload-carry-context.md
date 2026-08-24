<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add a canonical context-carrier wrapper to HookResult.data

**Status:** ⬜ Not Started
**Priority:** P3
**Effort:** Small
**Epic:** epic-character-core-system
**Related:** BUG-emotion-mood-hook-payload-missing-actor-chat.md, TASK-emotion-avatar-message-binding.md, src/generation/hooks/types.ts, src/generation/hooks/registry.ts, src/generation/auto-gen/content-hooks.ts

## Summary

Extend `HookResult.data` with a discriminated-union shape so every event
carries `{ actorId, chatId }` plus its type-specific payload. Eliminates
ambient-context threading from consumers and unblocks per-actor hook chaining
in group chats.

## Context

Today `HookResult.data` is `Record<string, unknown>` (`types.ts:46`). Every
hook writes its own keys; consumers (`content-hooks.ts`, `post-store.ts`,
`story-mode.ts`) reconstruct the actor/chat from the calling frame's
`opts.actorId`. See `BUG-emotion-mood-hook-payload-missing-actor-chat.md`
for the full analysis.

This task proposes the **shape**, not the implementation details — the
implementation is a follow-up to the BUG ticket once the shape is agreed.

## Proposal

1. Add a base interface `HookResultPayload`:
   ```ts
   interface HookResultPayload {
     actorId: string;
     chatId: string;
   }
   ```
2. Define per-`eventType` payload types:
   ```ts
   interface EmotionChangePayload extends HookResultPayload {
     dominantEmotion: string;
     indicators: string[];
   }
   interface MoodShiftPayload extends HookResultPayload {
     dominantMood: "positive" | "negative" | "neutral";
     delta: number;
     indicators: string[];
   }
   interface NsfwGatePayload extends HookResultPayload {
     level: NsfwLevel;
     rating?: string;
     allowed: boolean;
   }
   interface ModerationFlagPayload extends HookResultPayload {
     flags: string[];
     severity: string;
   }
   ```
3. Widen `HookResult.data` from `Record<string, unknown>` to a discriminated
   union (`HookResultPayload & EmotionChangePayload | …`) — or keep
   `unknown` but add a typed accessor on the registry.
5. Update hooks to merge `_context.actorId` + `_context.chatId` into `data`.
6. Update consumers (`content-hooks.ts`, `post-store.ts`, `story-mode.ts`)
   to type-narrow instead of using ambient `opts`.

## Alternative considered

Keep `data: Record<string, unknown>` and add **separate fields** to
`HookResult`:
```ts
interface HookResult {
  handled: boolean;
  eventType: HookEventType;
  actorId: string;    // NEW: carried directly
  chatId: string;     // NEW: carried directly
  data?: Record<string, unknown>;
  suppressContent?: boolean;
  reason?: string;
}
```
Simpler migration (no union changes), but `data` is still structurally loose.

## Acceptance Criteria

- [ ] Design doc accepted (this ticket is the design doc; the implementation
      ticket is the BUG).
- [ ] Decision recorded: union vs separate fields (default recommendation:
      union, see above).
- [ ] Migration plan for the 4 built-in hooks (EmotionHook, MoodHook,
      NsfwHook, ModerationHook) and their consumers.
- [ ] Backwards-compat shim (e.g. property carries `_actorId` if old shape
      present) — or a one-shot migration if no external consumers.
- [ ] Tests covering payload shape + per-actor hook chaining in group chats.