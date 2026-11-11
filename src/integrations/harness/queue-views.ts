// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * queue-views.ts — the harness turn queue's read model
 * (TASK-harness-multi-agent-turn-queue).
 *
 * The row-to-view mapping and the view's discriminated union: one shape per
 * state, so a completed turn cannot carry an error and a failed one cannot
 * lack one. Split from `queue.ts` to keep both files inside the per-file
 * code-line budget; the service in `queue.ts` is the only caller.
 */
import { HarnessQueueErrorCode, HarnessQueueTurnStatus, } from "../../db/enums";
import { type QueuedTurnRow, } from "./queue-store";

/** The fields every queue-turn view carries, whatever its state. */
export interface HarnessQueueTurnBase {
  /** The turn row id. */
  id: string;
  /** The batch the turn belongs to. */
  batchId: string;
  /** The profile the turn dispatches to. */
  profile: string;
  /** The prompt the harness works on. */
  prompt: string;
  /** The chat the turn's rows land in. */
  chatId: string;
  /** The actor the turn's rows are attributed to. */
  actorId: string;
  /** Enqueue timestamp. */
  createdAt: string;
}

/** One queued turn's state — discriminated by `status`, one shape per state. */
export type HarnessQueueTurnView =
  | (HarnessQueueTurnBase & { status: "queued" })
  | (HarnessQueueTurnBase & { status: "running"; startedAt: string })
  | (HarnessQueueTurnBase & {
    status: "completed";
    startedAt: string;
    finishedAt: string;
    /** The assistant row the turn landed in. */
    resultMessageId: string;
  })
  | (HarnessQueueTurnBase & {
    status: "failed";
    startedAt: string | null;
    finishedAt: string;
    errorCode: HarnessQueueErrorCode;
    errorMessage: string;
  })
  | (HarnessQueueTurnBase & { status: "cancelled"; finishedAt: string | null });

/**
 * Map a row to its discriminated state view.
 * @param row - the row as the store reads it
 * @returns the view for the row's current state
 * @throws when the row carries a status outside the closed vocabulary (a
 * corrupt row — loud, never silently re-shaped).
 */
export function rowToView(row: QueuedTurnRow,): HarnessQueueTurnView {
  const base = {
    id: row.id,
    batchId: row.batch_id,
    profile: row.profile,
    prompt: row.prompt,
    chatId: row.chat_id,
    actorId: row.actor_id,
    createdAt: row.created_at,
  };

  switch (row.status) {
    case HarnessQueueTurnStatus.Queued:
      return { ...base, status: "queued", };
    case HarnessQueueTurnStatus.Running: {
      return { ...base, status: "running", startedAt: row.started_at ?? row.created_at, };
    }

    case HarnessQueueTurnStatus.Completed: {
      return {
        ...base,
        status: "completed",
        startedAt: row.started_at ?? row.created_at,
        finishedAt: row.finished_at ?? row.created_at,
        resultMessageId: row.result_message_id ?? "",
      };
    }

    case HarnessQueueTurnStatus.Failed: {
      return {
        ...base,
        status: "failed",
        startedAt: row.started_at,
        finishedAt: row.finished_at ?? row.created_at,
        errorCode: row.error_code ?? HarnessQueueErrorCode.TurnFailed,
        errorMessage: row.error_message ?? "unknown failure",
      };
    }

    case HarnessQueueTurnStatus.Cancelled: {
      return { ...base, status: "cancelled", finishedAt: row.finished_at, };
    }

    default:
      throw new Error(`unknown harness queue status: ${String(row.status,)}`,);
  }
}
