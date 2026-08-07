import type { Kysely, } from "kysely";
import {
  classifyTransitionMessage,
  createTransition,
  generateRuleName,
  type MessageRef,
  promoteMessagesToMemories,
} from "../../chat";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { log, } from "./helpers";

/** Chat rows fetched once by the create handler and shared by post-insert side effects. */
export interface ChatRecord {
  name: string | null;
  mode: string | null;
  current_location_id: string | null;
  world_id: string | null;
}

/**
 * Auto-rename a direct chat from its default placeholder name after the first
 * user message, based on the character and current location.
 */
export async function autoRenameChat(
  database: Kysely<DB>,
  chatId: string,
  effectiveContent: string,
  chatRecord: ChatRecord | undefined,
): Promise<void> {
  if (
    chatRecord?.mode !== "direct" ||
    (chatRecord.name !== "New Chat" && chatRecord.name !== "")
  ) {
    return;
  }

  // Fetch character name for rename
  const charActor = await database
    .selectFrom("chat_participants",)
    .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
    .select(["actors.display_name",],)
    .where("chat_participants.chat_id", "=", chatId,)
    .where("actors.agent_type", "in", ["ai", "narrator", "npc",],)
    .executeTakeFirst();

  let locationName: string | null = null;
  if (chatRecord.current_location_id) {
    const loc = await database
      .selectFrom("locations",)
      .select("name",)
      .where("id", "=", chatRecord.current_location_id,)
      .executeTakeFirst();
    locationName = loc?.name ?? null;
  }

  const renameResult = generateRuleName(
    charActor?.display_name ?? "",
    locationName,
    effectiveContent,
  );

  await database
    .updateTable("chats",)
    .set({ name: renameResult.name, updated_at: new Date().toISOString(), },)
    .where("id", "=", chatId,)
    .execute();

  log().debug("Auto-renamed chat", { chatId, newName: renameResult.name, },);
}

/**
 * Detect scene transitions for the message and apply their side effects:
 * location changes update the chat's current location; context cuts build a
 * transition event and promote at-risk messages to memories.
 */
export async function handleSceneTransitions(
  database: Kysely<DB>,
  config: Config,
  chatId: string,
  actorId: string,
  effectiveContent: string,
  chatRecord: ChatRecord | undefined,
): Promise<void> {
  // Fetch recent messages for AUX LLM context
  const recentMsgs = await database
    .selectFrom("messages",)
    .select(["content",],)
    .where("chat_id", "=", chatId,)
    .orderBy("created_at", "desc",)
    .limit(2,)
    .execute();

  const recentContent = recentMsgs.map((m,) => m.content).reverse();

  const classification = await classifyTransitionMessage(
    effectiveContent,
    recentContent,
    config,
    database,
    actorId ?? undefined,
  );

  if (!classification.isTransition) { return; }

  if (classification.type === "location_change" && chatRecord?.world_id) {
    // Location change detected — use location hint from classifier or fallback to regex
    const locationName = classification.locationHint ??
      /\b(go to|travel to|head to|enter|arrive at|visit)\s+(?:the\s+)?([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/i
        .exec(effectiveContent,)?.[2];

    if (locationName) {
      const location = await database
        .selectFrom("locations",)
        .select("id",)
        .where("world_id", "=", chatRecord.world_id,)
        .where("name", "like", `%${locationName}%`,)
        .executeTakeFirst();

      if (location) {
        await database
          .updateTable("chats",)
          .set({ current_location_id: location.id, updated_at: new Date().toISOString(), },)
          .where("id", "=", chatId,)
          .execute();

        log().info("Location change detected", {
          chatId,
          locationId: location.id,
          source: classification.source,
          confidence: classification.confidence,
        },);
      }
    }
  }

  // Create transition event for context cuts + promote trimmed messages.
  if (classification.type === "context_cut") {
    let promotedMemoryIds: string[] = [];
    try {
      // Candidate messages at risk of trimming: everything visible in the chat.
      const [promotionCandidates, chatCtx, participants,] = await Promise.all([
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

      const messageRefs: MessageRef[] = promotionCandidates.map((m,) => ({
        messageId: m.id,
        role: m.role,
        content: m.content ?? "",
        tokenCount: Math.ceil((m.content ?? "").length * 0.3,),
        createdAt: m.created_at,
      }));

      promotedMemoryIds = await promoteMessagesToMemories(database, {
        messages: messageRefs,
        maxTokens: chatCtx?.context_max_tokens ?? 4000,
        actorId: actorId ?? "",
        chatId,
        worldId: chatCtx?.world_id ?? null,
        participantIds: participants.map((p,) => p.actor_id),
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
