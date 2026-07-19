/**
 * Recent Events section — injects the user's recent notifications (mentions,
 * quest/GM updates) as a `[Recent Events]` block so the character stays aware
 * of off-screen activity without the user relaying it manually. See
 * docs/frontend/notifications.md (Prompt Injection).
 *
 * Placed as a user-role message near the end of context (mirrors
 * dynamicContext) to keep the system prompt prefix byte-stable for KV-cache.
 */
import { NotificationService, } from "../../../notifications/service";
import type { SectionBuilder, } from "../types";

export const recentEventsSection: SectionBuilder = {
  name: "recentEvents",
  enabled: (ctx,) => Boolean(ctx.params.userId,),
  build: async (ctx,) => {
    const userId = ctx.params.userId;
    if (!userId) { return []; }
    const text = await new NotificationService(ctx.db,).buildRecentEventsContext(userId, ctx.chat.id,);
    return text ? [{ role: "user", content: text, },] : [];
  },
};
