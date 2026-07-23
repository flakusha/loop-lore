/**
 * Memory section — the actor's most important memories, provision-filtered
 * by scope, privacy, shareability, and token budget, then injection-filtered
 * by probability, comfort, and context relevance.
 */
import type { Kysely, } from "kysely";
import { RelationshipsService, } from "../../../characters/services/relationships-service";
import type { DB, } from "../../../db/schema";
import {
  DEFAULT_COMFORT,
  DEFAULT_INJECTION_CONFIG,
  type InjectionContext,
  selectMemoriesForInjection,
} from "../../../memory/injection";
import { type ProvisionContext, provisionMemories, } from "../../../memory/provision";
import type { MemoryEntry, } from "../../../memory/types";
import { safeJsonParse, } from "../../../utils";
import { wrapSection, } from "../../xml-utils";
import type { SectionBuilder, } from "../types";

/**
 * Compute the trust modifier for a viewer based on average trust
 * across all chat participants.
 *
 * Trust ranges from -100 (distrust) to +100 (complete trust).
 * Normalized to -1..+1 for the provision algorithm.
 *
 * @param db - Kysely instance
 * @param viewerId - The actor whose memories are being provisioned
 * @param participantIds - All other participants in the chat
 * @param worldId - Current world for scoped relationships
 * @returns Trust modifier between -1 and +1
 */
async function computeTrustModifier(
  db: Kysely<DB>,
  viewerId: string,
  participantIds: string[],
  worldId: string | null,
): Promise<number> {
  if (participantIds.length === 0) { return 0; }

  const relationshipsService = new RelationshipsService(db,);
  let totalTrust = 0;
  let count = 0;

  for (const participantId of participantIds) {
    if (participantId === viewerId) { continue; }
    const rel = await relationshipsService.getRelationship(
      viewerId,
      participantId,
      worldId ?? undefined,
    );
    if (rel) {
      totalTrust += rel.trust;
      count++;
    }
  }

  // Average trust normalized to -1..+1
  if (count === 0) { return 0; }
  return Math.max(-1, Math.min(1, (totalTrust / count) / 100,),);
}

/**
 * Build a ProvisionContext from the prompt assembly context.
 *
 * Includes trust modifier computed from character relationships
 * to enable trust-augmented memory sharing probability.
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

  const participantIds = participants.map((p,) => p.actor_id);
  const trustModifier = await computeTrustModifier(db, actorId, participantIds, worldId,);

  return {
    viewerId: actorId,
    ownerId: actorId,
    chatId,
    worldId,
    participantIds,
    trustModifier,
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
    importance: r.importance,
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

    // Step 1: Provision filter (scope, privacy, shareability, token budget)
    const provisionResult = provisionMemories(memories, provisionCtx, 1024,);
    if (provisionResult.accepted.length === 0) { return []; }

    // Step 2: Injection filter (probability, comfort, context relevance)
    const injectionCtx: InjectionContext = {
      chatId: ctx.chat.id,
      worldId: ctx.chat.world_id,
      locationId: ctx.chat.current_location_id,
      isPrivateChat: provisionCtx.participantIds.length <= 2,
      participantCount: provisionCtx.participantIds.length,
      turnNumber: 0, // TODO: pass actual turn number from context
      currentKeywords: [], // TODO: extract from current message
      averageIntimacy: 50, // TODO: compute from relationships
      moodModifier: 0, // TODO: pass from character mood
    };

    const injectionResult = selectMemoriesForInjection(
      provisionResult.accepted,
      DEFAULT_INJECTION_CONFIG,
      injectionCtx,
      DEFAULT_COMFORT,
    );

    if (injectionResult.selected.length === 0) { return []; }

    const memoryText = injectionResult.selected
      .map((m,) => `- [${m.memoryType}] ${m.content}`)
      .join("\n",);

    // XML delimiting with per-session nonce prevents injected memories from being
    // mistaken for instructions by the model.
    return [{ role: "system", content: wrapSection("memory_context", memoryText,), },];
  },
};
