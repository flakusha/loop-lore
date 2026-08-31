// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Quest engine helpers for the story subsystem.
 *
 * Extracted from quest-engine.ts to eliminate repeated patterns
 * (Dedup Phase 11).
 */
import type { Kysely, } from "kysely";
import type {
  QuestProgressStatus,
} from "../../db/enums-story/quests";
import {
  questProgressValidator,
  QuestStatus,
  questStatusMachine,
} from "../../db/enums-story/quests";
import type { DB, } from "../../db/schema";
import { TransitionError, } from "../../db/state";
import { getLogger, } from "../../logger";
import { safeJsonStringify, } from "../../utils";
// ── Quest Engine Helpers ─────────────────────────────────────

/**
 * Serialize `value` via `safeJsonStringify`, throwing on failure.
 *
 * Replaces the repeated safeJsonStringify + ok-check + throw pattern
 * found in quest-engine.ts createQuest.
 * @param value
 * @param fieldName
 */
export function serializeOrThrow(value: unknown, fieldName: string,): string {
  const r = safeJsonStringify(value,);
  if (!r.ok) {
    getLogger()
      .child({ module: "quest-engine", },)
      .error(`safeJsonStringify ${fieldName} failed`, undefined, { error: r.error, },);
    throw new Error(`Failed to serialize quest ${fieldName}`,);
  }
  return r.value;
}

/**
 * Read a quest's current status and assert `to` is a legal machine transition.
 * @param db
 * @param questId
 * @param to
 * @returns The current status (pre-transition)
 * @throws {Error} When the quest does not exist
 * @throws {TransitionError} When the status change is not allowed by the machine
 */
export async function requireQuestTransition(
  db: Kysely<DB>,
  questId: string,
  to: QuestStatus,
): Promise<QuestStatus> {
  const row = await db
    .selectFrom("quests",)
    .select("status",)
    .where("id", "=", questId,)
    .executeTakeFirst();
  if (!row) {
    throw new Error(`Quest not found: ${questId}`,);
  }
  if (!questStatusMachine.canTransition(row.status, to,)) {
    throw new TransitionError(row.status, to,);
  }
  return row.status;
}

/**
 * Transition a quest's status and all its progress rows in one write.
 *
 * Validates the quest status move against {@link questStatusMachine} and the
 * resulting (quest, progress) pair against {@link questProgressValidator}.
 * @param db
 * @param questId
 * @param questStatus
 * @param progressStatus
 * @throws {Error} When the quest does not exist
 * @throws {TransitionError} When the status change is not allowed
 */
export async function transitionQuestStatus(
  db: Kysely<DB>,
  questId: string,
  questStatus: QuestStatus,
  progressStatus: QuestProgressStatus,
): Promise<void> {
  await requireQuestTransition(db, questId, questStatus,);
  questProgressValidator.assertValid(questStatus, progressStatus,);

  await db
    .updateTable("quests",)
    .set({ status: questStatus, },)
    .where("id", "=", questId,)
    .execute();

  await db
    .updateTable("quest_progress",)
    .set({ status: progressStatus, },)
    .where("quest_id", "=", questId,)
    .execute();
}

/**
 * Select all active quests for a world, ordered by priority descending.
 * @param db
 * @param worldId
 */
export async function selectActiveQuests(
  db: Kysely<DB>,
  worldId: string,
) {
  return db
    .selectFrom("quests",)
    .selectAll()
    .where("world_id", "=", worldId,)
    .where("status", "=", QuestStatus.Active,)
    .orderBy("priority", "desc",)
    .execute();
}

/**
 * Upsert quest progress for a chat: update the existing row if present,
 * otherwise insert a new one.
 * @param db
 * @param questId
 * @param chatId
 * @param newProgress
 * @param completed
 * @param sourceMessageId
 */
export async function upsertQuestProgress(
  db: Kysely<DB>,
  questId: string,
  chatId: string,
  newProgress: number,
  completed: boolean,
  sourceMessageId?: string,
): Promise<void> {
  const existing = await db
    .selectFrom("quest_progress",)
    .select("id",)
    .where("quest_id", "=", questId,)
    .where("chat_id", "=", chatId,)
    .executeTakeFirst();

  if (existing) {
    await db
      .updateTable("quest_progress",)
      .set({
        progress: newProgress,
        status: completed ? "completed" : "active",
        updated_at: new Date().toISOString(),
        completed_at: completed ? new Date().toISOString() : undefined,
      },)
      .where("id", "=", existing.id,)
      .execute();
  } else {
    await db
      .insertInto("quest_progress",)
      .values({
        id: crypto.randomUUID(),
        quest_id: questId,
        chat_id: chatId,
        progress: newProgress,
        status: completed ? "completed" : "active",
        contributed_events: sourceMessageId
          ? (() => {
            const r = safeJsonStringify([sourceMessageId,],);
            return r.ok ? r.value : "[]";
          })()
          : "[]",
        completed_at: completed ? new Date().toISOString() : null,
      },)
      .execute();
  }
}
