/**
 * Scene transition detection and side effects for user messages.
 *
 * Handles location changes (deterministic world-scoped match, event log
 * persistence, section connection) and context cuts (memory promotion).
 *
 * Split from transitions.ts to stay under the 250L file-size gate.
 */
import type { Kysely, } from "kysely";
import {
  classifyTransitionMessage,
  createTransition,
  type MessageRef,
  promoteMessagesToMemories,
} from "../../chat";
import { recordLocationChange, } from "../../chat/service/location-events";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { uid, } from "../../utils";
import { log, } from "./helpers";
import type { ChatRecord, } from "./transitions";

/** Derive a section label from a location id (fallback when name not available). */
const locationIdToLabel = (locationId: string,): string => `Location ${locationId.slice(0, 8,)}`;

/**
 * Resolve a location name to a world-scoped location row.
 * Exact match first, then LIKE with dedup; ambiguous matches return null.
 */
async function resolveLocation(
  database: Kysely<DB>,
  locationName: string,
  worldId: string,
): Promise<{ id: string; name?: string } | null> {
  const exact = await database
    .selectFrom("locations",)
    .select(["id", "name",],)
    .where("world_id", "=", worldId,)
    .where("name", "=", locationName,)
    .executeTakeFirst();
  if (exact) { return exact; }
  const likeMatches = await database
    .selectFrom("locations",)
    .select(["id", "name",],)
    .where("world_id", "=", worldId,)
    .where("name", "like", `%${locationName}%`,)
    .execute();

  if (likeMatches.length === 1) { return likeMatches[0] ?? null; }

  if (likeMatches.length > 1) {
    log().warn("Ambiguous location match, skipping", {
      locationName,
      matches: Array.from(likeMatches, loc => loc.name,),
    },);
  }

  return null;
}

/**
 * Detect scene transitions for the message and apply their side effects:
 * location changes update the chat's location; context cuts promote messages.
 */
export async function handleSceneTransitions(
  database: Kysely<DB>,
  config: Config,
  chatId: string,
  actorId: string,
  effectiveContent: string,
  chatRecord: ChatRecord | undefined,
  messageId?: string,
): Promise<void> {
  const recentMsgs = await database
    .selectFrom("messages",)
    .select(["content",],)
    .where("chat_id", "=", chatId,)
    .orderBy("created_at", "desc",)
    .limit(2,)
    .execute();

  const recentContent = Array.from(recentMsgs, (m,) => m.content,).reverse();

  const classification = await classifyTransitionMessage(
    effectiveContent,
    recentContent,
    config,
    database,
    actorId ?? undefined,
  );

  if (!classification.isTransition) { return; }

  if (classification.type === "location_change" && chatRecord?.world_id) {
    const locationName = classification.locationHint ??
      /\b(go to|travel to|head to|enter|arrive at|visit)\s+(?:the\s+)?([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/i
        .exec(effectiveContent,)?.[2];

    if (!locationName) { return; }

    const location = await resolveLocation(database, locationName, chatRecord.world_id,);

    if (!location) {
      log().info("Location not found in world", {
        chatId,
        locationName,
        worldId: chatRecord.world_id,
      },);
      return;
    }

    // Persist: update scalar + event log + section assign in one transaction
    await database.transaction().execute(async (tx,) => {
      await tx
        .updateTable("chats",)
        .set({ current_location_id: location.id, updated_at: new Date().toISOString(), },)
        .where("id", "=", chatId,)
        .execute();

      await recordLocationChange(tx, {
        chatId,
        fromLocationId: chatRecord.current_location_id,
        toLocationId: location.id,
        source: "auto",
        triggeringMessageId: messageId ?? null,
      },);

      // Connect sections: create a section for this message if none assigned
      if (messageId) {
        const msg = await tx
          .selectFrom("messages",)
          .select("section_id",)
          .where("id", "=", messageId,)
          .where("chat_id", "=", chatId,)
          .executeTakeFirst();

        if (msg && !msg.section_id) {
          const maxIndex = await tx
            .selectFrom("chat_sections",)
            .select(tx.fn.max<number>("sort_index",).as("max",),)
            .where("chat_id", "=", chatId,)
            .executeTakeFirst();

          const sectionId = uid();
          await tx
            .insertInto("chat_sections",)
            .values({
              id: sectionId,
              chat_id: chatId,
              label: location.name ?? locationIdToLabel(location.id,),
              location_id: location.id,
              sort_index: (maxIndex?.max ?? 0) + 1,
            },)
            .execute();

          await tx
            .updateTable("messages",)
            .set({ section_id: sectionId, },)
            .where("id", "=", messageId,)
            .where("chat_id", "=", chatId,)
            .execute();
        }
      }
    },);

    log().info("Location change detected and persisted", {
      chatId,
      fromLocationId: chatRecord.current_location_id,
      toLocationId: location.id,
      locationName: location.name,
      source: classification.source,
      confidence: classification.confidence,
    },);
    return;
  }

  if (classification.type === "context_cut") {
    let promotedMemoryIds: string[] = [];
    try {
      const [
        promotionCandidatesResult,
        chatCtxResult,
        participantsResult,
      ] = await Promise.allSettled([
        database
          .selectFrom("messages",)
          .select(["id", "role", "content", "created_at",],)
          .where("chat_id", "=", chatId,)
          .where("visibility", "=", "visible",)
          .orderBy("created_at", "asc",)
          .execute(),
        database
          .selectFrom("chats",)
          .select(["context_max_tokens", "world_id",],)
          .where("id", "=", chatId,)
          .executeTakeFirst(),
        database
          .selectFrom("chat_participants",)
          .select(["actor_id",],)
          .where("chat_id", "=", chatId,)
          .execute(),
      ],);
      if (promotionCandidatesResult.status !== "fulfilled") { throw promotionCandidatesResult.reason; }
      if (chatCtxResult.status !== "fulfilled") { throw chatCtxResult.reason; }
      if (participantsResult.status !== "fulfilled") { throw participantsResult.reason; }
      const promotionCandidates = promotionCandidatesResult.value;
      const chatCtx = chatCtxResult.value;
      const participants = participantsResult.value;

      const messageRefs: MessageRef[] = Array.from(promotionCandidates, (m,) => ({
        messageId: m.id,
        role: m.role,
        content: m.content ?? "",
        tokenCount: Math.ceil((m.content ?? "").length * 0.3,),
        createdAt: m.created_at,
      }),);

      promotedMemoryIds = await promoteMessagesToMemories(database, {
        messages: messageRefs,
        maxTokens: chatCtx?.context_max_tokens ?? 4000,
        actorId: actorId ?? "",
        chatId,
        worldId: chatCtx?.world_id ?? null,
        participantIds: Array.from(participants, (p,) => p.actor_id,),
      },);
    } catch (error) {
      log().warn("Context cut memory promotion failed", {
        chatId,
        actorId,
        error: error instanceof Error ? error.message : String(error,),
      },);
    }

    const transition = createTransition({
      actorId,
      narration: `Context cut: ${effectiveContent.slice(0, 100,)}`,
      promotedMemoryIds,
    },);

    log().info("Context cut transition detected", {
      chatId,
      actorId,
      transitionType: classification.type,
      source: classification.source,
      promotedMemoryCount: promotedMemoryIds.length,
      transition,
    },);
  }
}
