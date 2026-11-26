// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * queue-views.ts contract tests: the row → view mapping — one shape per
 * state, the camelCase projection of the base fields, the per-state null
 * fallbacks, and the loud throw on a corrupt status. Pure mapping; no DB.
 */
import { describe, expect, it, } from "bun:test";
import { HarnessQueueErrorCode, HarnessQueueTurnStatus, } from "../../db/enums";
import { type QueuedTurnRow, } from "./queue-store";
import { rowToView, } from "./queue-views";

/** A minimal queued row; the tests patch its state fields. */
const baseRow: QueuedTurnRow = {
  id: "t1",
  batch_id: "b1",
  profile: "omp",
  prompt: "go north",
  status: HarnessQueueTurnStatus.Queued,
  chat_id: "chat-1",
  actor_id: "actor-1",
  requested_by: "user-admin",
  requested_role: "admin",
  turn_key: null,
  owner_slug: null,
  attempts: 0,
  result_message_id: null,
  error_code: null,
  error_message: null,
  created_at: "2026-01-01T00:00:00.000Z",
  started_at: null,
  finished_at: null,
};

/** The base view every state view projects onto. */
const baseView = {
  id: "t1",
  batchId: "b1",
  profile: "omp",
  prompt: "go north",
  chatId: "chat-1",
  actorId: "actor-1",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("rowToView", () => {
  it("maps a queued row to exactly the queued shape (base fields camelCased)", () => {
    expect(rowToView(baseRow,),).toEqual({ ...baseView, status: "queued", },);
  });

  it("maps a running row, falling startedAt back to createdAt", () => {
    const running: QueuedTurnRow = {
      ...baseRow,
      status: HarnessQueueTurnStatus.Running,
      started_at: "2026-01-02T00:00:00.000Z",
      attempts: 1,
    };

    expect(rowToView(running,),).toEqual({
      ...baseView,
      status: "running",
      startedAt: "2026-01-02T00:00:00.000Z",
    },);

    // A claimed row whose started_at was somehow lost still renders.
    expect(rowToView({ ...baseRow, status: HarnessQueueTurnStatus.Running, },),).toEqual({
      ...baseView,
      status: "running",
      startedAt: "2026-01-01T00:00:00.000Z",
    },);
  });

  it("maps a completed row and falls its nulls back to createdAt", () => {
    const completed: QueuedTurnRow = {
      ...baseRow,
      status: HarnessQueueTurnStatus.Completed,
      started_at: "2026-01-02T00:00:00.000Z",
      finished_at: "2026-01-03T00:00:00.000Z",
      result_message_id: "msg-9",
    };

    expect(rowToView(completed,),).toEqual({
      ...baseView,
      status: "completed",
      startedAt: "2026-01-02T00:00:00.000Z",
      finishedAt: "2026-01-03T00:00:00.000Z",
      resultMessageId: "msg-9",
    },);

    const degraded = rowToView({ ...baseRow, status: HarnessQueueTurnStatus.Completed, },);
    expect(degraded,).toEqual({
      ...baseView,
      status: "completed",
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:00:00.000Z",
      resultMessageId: "",
    },);
  });

  it("maps a failed row, defaulting its error pair, keeping startedAt null", () => {
    const failed: QueuedTurnRow = {
      ...baseRow,
      status: HarnessQueueTurnStatus.Failed,
      started_at: "2026-01-02T00:00:00.000Z",
      finished_at: "2026-01-03T00:00:00.000Z",
      error_code: HarnessQueueErrorCode.ProfileUnknown,
      error_message: "no such profile",
    };

    expect(rowToView(failed,),).toEqual({
      ...baseView,
      status: "failed",
      startedAt: "2026-01-02T00:00:00.000Z",
      finishedAt: "2026-01-03T00:00:00.000Z",
      errorCode: "profile_unknown",
      errorMessage: "no such profile",
    },);

    // A failed row with no error pair defaults loudly but never throws;
    // startedAt keeps null (never a silent createdAt backfill).
    expect(rowToView({ ...baseRow, status: HarnessQueueTurnStatus.Failed, },),).toEqual({
      ...baseView,
      status: "failed",
      startedAt: null,
      finishedAt: "2026-01-01T00:00:00.000Z",
      errorCode: HarnessQueueErrorCode.TurnFailed,
      errorMessage: "unknown failure",
    },);
  });

  it("maps a cancelled row, passing finishedAt through untouched", () => {
    expect(
      rowToView({ ...baseRow, status: HarnessQueueTurnStatus.Cancelled, finished_at: "2026-01-02T00:00:00.000Z", },),
    ).toEqual({
      ...baseView,
      status: "cancelled",
      finishedAt: "2026-01-02T00:00:00.000Z",
    },);

    expect(rowToView({ ...baseRow, status: HarnessQueueTurnStatus.Cancelled, },),).toEqual({
      ...baseView,
      status: "cancelled",
      finishedAt: null,
    },);
  });

  it("throws on a status outside the closed vocabulary (corrupt row)", () => {
    const corrupt = { ...baseRow, status: "corrupt", } as unknown as QueuedTurnRow;
    expect(() => rowToView(corrupt,)).toThrow("unknown harness queue status: corrupt",);
  });
});
