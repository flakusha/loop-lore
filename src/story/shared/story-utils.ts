// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared helpers for story subsystem modules.
 *
 * Extracted from synthetic/runner.ts and quest-engine.ts to eliminate
 * repeated patterns (Dedup Phase 11).
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
// ── Synthetic Runner Types ───────────────────────────────────
/** Common return shape for synthetic test case execution methods. */
export interface CaseResult {
  status: "passed" | "failed" | "skipped";
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  reason?: string;
}
/** Build a skipped-case result with an optional actual payload. */
export function skippedResult(
  expected: Record<string, unknown>,
  reason: string,
  actual: Record<string, unknown> = {},
): CaseResult {
  return { status: "skipped", expected, actual, reason, };
}

/**
 * Collect scores by evaluating a callback `iterations` times, then return
 * the score array and the variance (max − min).
 */
export function collectScoresAndVariance(
  evaluate: (i: number,) => number,
  iterations: number,
): { scores: number[]; variance: number } {
  const scores: number[] = [];
  for (let i = 0; i < iterations; i++) {
    scores.push(evaluate(i,),);
  }
  const variance = Math.max(...scores,) - Math.min(...scores,);
  return { scores, variance, };
}

/**
 * Build a pass/fail CaseResult for quality score variance checks.
 *
 * @param scores  - collected score array
 * @param variance - max − min spread
 * @param passed   - whether the check passed
 * @param expected - the case's expected map
 * @param reason   - failure reason string (omit when passed)
 */
export function varianceResult(
  scores: number[],
  variance: number,
  passed: boolean,
  expected: Record<string, unknown>,
  reason?: string,
): CaseResult {
  return {
    status: passed ? "passed" : "failed",
    expected,
    actual: { scores, variance, },
    reason: passed ? undefined : reason,
  };
}

/**
 * Count results by status, returning `{ passed, failed, skipped }`.
 */
export function countByStatus(results: { status: string }[],): {
  passed: number;
  failed: number;
  skipped: number;
} {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const r of results) {
    switch (r.status) {
      case "passed": {
        passed++;
        break;
      }
      case "failed": {
        failed++;
        break;
      }
      case "skipped": {
        skipped++;
        break;
      }
    }
  }
  return { passed, failed, skipped, };
}

// ── Quest Engine Helpers ─────────────────────────────────────

/**
 * Serialize `value` via `safeJsonStringify`, throwing on failure.
 *
 * Replaces the repeated safeJsonStringify + ok-check + throw pattern
 * found in quest-engine.ts createQuest.
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
 *
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
 *
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
