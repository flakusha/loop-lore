/**
 * Memory section — the actor's most important memories, provision-filtered
 * by scope, privacy, shareability, and token budget.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { type ProvisionContext, provisionMemories, } from "../../../memory/provision";
import type { MemoryEntry, } from "../../../memory/types";
import { safeJsonParse, } from "../../../utils";
import { wrapSection, } from "../../xml-utils";
import type { SectionBuilder, } from "../types";

/**
 * Build a ProvisionContext from the prompt assembly context.
 */
async function buildProvisionContext(
  db: Kysely<DB>,
  actorId: string,
  chatId: string,
  worldId: string | null,
): Promise<ProvisionContext> {
  const participants = await db
    .selectFrom("chat_participants",)
    .select("actor_id",)
    .where("chat_id", "=", chatId,)
    .execute();

  return {
    viewerId: actorId,
    ownerId: actorId,
    chatId,
    worldId,
    participantIds: participants.map((p,) => p.actor_id),
  };
}

/**
 * Fetch all memories for the actor from the database.
 */
async function fetchActorMemories(
  db: Kysely<DB>,
  actorId: string,
): Promise<MemoryEntry[]> {
  const rows = await db
    .selectFrom("actor_memories",)
    .selectAll()
    .where("actor_id", "=", actorId,)
    .orderBy("importance", "desc",)
    .limit(50,)
    .execute();

  return rows.map((r,) => ({
    id: r.id,
    actorId: r.actor_id,
    userId: r.user_id ?? undefined,
    worldId: r.world_id ?? undefined,
    content: r.content,
    memoryType: r.memory_type,
    confidence: r.confidence,
    keywords: (() => {
      const parsed = safeJsonParse<string[]>(r.keywords ?? "[]",);
      return parsed.ok ? parsed.value : [];
    })(),
    sourceChatId: r.source_chat_id ?? undefined,
    sourceMessageId: r.source_message_id ?? undefined,
    pinned: Boolean(r.pinned,),
    scope: (r.scope ?? "character") as MemoryEntry["scope"],
    privacy: (r.privacy ?? "shared") as MemoryEntry["privacy"],
    shareability: r.shareability,
    expiresAt: r.expires_at ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export const memorySection: SectionBuilder = {
  name: "memories",
  enabled: () => true,
  build: async (ctx,) => {
    const memories = await fetchActorMemories(ctx.db, ctx.actor.id,);
    if (memories.length === 0) { return []; }

    const provisionCtx = await buildProvisionContext(
      ctx.db,
      ctx.actor.id,
      ctx.chat.id,
      ctx.chat.world_id,
    );

    const result = provisionMemories(memories, provisionCtx, 1024,);
    if (result.accepted.length === 0) { return []; }

    const memoryText = result.accepted
      .map((m,) => `- [${m.memoryType}] ${m.content}`)
      .join("\n",);

    // XML delimiting with per-session nonce prevents injected memories from being
    // mistaken for instructions by the model.
    return [{ role: "system", content: wrapSection("memory_context", memoryText,), },];
  },
};
