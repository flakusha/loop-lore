// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Scene transition detection and side effects for user messages.
 *
 * Handles location changes (deterministic world-scoped match, event log
 * persistence, section connection) and context cuts (memory promotion).
 *
 * Split from transitions.ts to stay under the 250L file-size gate.
 */
import type { Kysely, } from "kysely";
import { classifyTransitionMessage, } from "../../chat";
import { recordLocationChange, } from "../../chat/service/location-events";
import {
  executeReuniteFromNarration,
  executeSplitFromNarration,
  resolveLocation,
} from "../../chat/service/split-execution";
import { classifySplitIntent, } from "../../chat/split-classifier";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { uid, } from "../../utils";
import { log, } from "./helpers";
import { applyContextCut, } from "./scene-transition-context-cut";
import type { ChatRecord, } from "./transitions";

/**
 * Derive a section label from a location id (fallback when name not available).
 * @param locationId
 */
const locationIdToLabel = (locationId: string,): string => `Location ${locationId.slice(0, 8,)}`;

/**
 * Detect scene transitions for the message and apply their side effects:
 * location changes update the chat's location; context cuts promote messages.
 * @param database
 * @param config
 * @param chatId
 * @param actorId
 * @param effectiveContent
 * @param chatRecord
 * @param messageId
 * @returns {Promise<void>}
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

  // Regex-only by design: split detection runs on every user message. The
  // classifier's AUX fallback is opt-in (allowAux) and belongs to the
  // transition AUX slice, not to a second blocking roundtrip on a message
  // that already pays one in classifyTransitionMessage below. Execution is
  // deterministic derivation (see chat/service/split-execution.ts) and
  // silently skips narration that yields no executable specs.
  const splitClass = await classifySplitIntent(effectiveContent, config, database,);
  if (splitClass.isSplit) {
    log().info("Split narration detected", { chatId, source: splitClass.source, },);
    await executeSplitFromNarration(database, { chatId, actorId, narration: effectiveContent, },);
  } else if (splitClass.isReunite) {
    log().info("Reunite narration detected", { chatId, source: splitClass.source, },);
    await executeReuniteFromNarration(database, { chatId, actorId, },);
  }

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
    await applyContextCut(
      database,
      chatId,
      actorId,
      effectiveContent,
      classification.source,
    );
  }
}
