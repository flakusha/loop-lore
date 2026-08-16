<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Fix message-reactions DELETE access check

**Status:** ✅ Done (2026-08-05) — reaction access shipped: all reaction endpoints gated via `checkChatAccess`; POST toggle added; `message-reactions.test.ts` (8 tests)
**Priority:** Medium
**Effort:** Small
**Epic:** epic-logic-reconciliation

## Summary

`DELETE /api/messages/:id/reactions` in `src/routes/message-reactions.ts` does not verify the user has access to the message. Any authenticated user can delete any other user's reactions.

## Current Code

```ts
.delete("/api/messages/:id/reactions", async (ctx: any) => {
  const userId = ctx.userId as string | null;
  if (!userId) { return unauthorized(); }
  const messageId = ctx.params.id;
  // No access check — proceeds to delete
  await database.deleteFrom("message_reactions")
    .where("message_id", "=", messageId)
    .where("user_id", "=", userId)
    .execute();
  return { ok: true };
})
```

## Fix

Add access check before deletion — verify the user owns the message or is a chat participant:

```ts
const msg = await database.selectFrom("messages",)
  .innerJoin("chats", "chats.id", "messages.chat_id",)
  .select(["messages.id", "messages.chat_id", "chats.created_by",],)
  .where("messages.id", "=", messageId,)
  .executeTakeFirst();
if (!msg) { return notFound("Message not found",); }
const isOwner = msg.created_by === userId;
const isParticipant = await database.selectFrom("chat_participants",)
  .select("actor_id",)
  .where("chat_id", "=", msg.chat_id,)
  .where("actor_id", "=", userId,)
  .executeTakeFirst();
if (!isOwner && !isParticipant) { return notFound("Message not found",); }
```

## Acceptance Criteria

- [ ] DELETE verifies message access before deleting reactions
- [ ] Non-participants get 404 (not 200)
- [ ] Tests pass: `bun test src/routes/`
