// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for emotion-avatar-service/job-records.ts — DB-backed job lifecycle.
 */
import { describe, expect, test, } from "bun:test";
import { EmotionType, } from "../../../db/enums";
import { createTestDb, } from "../../../test-utils/create-test-db";
import { insertActors, } from "../../../test-utils/insert-helpers";
import {
  createGenerationJobRecord,
  getGenerationJobRecord,
  listGenerationJobRecords,
  updateGenerationJobRecord,
} from "./job-records";

describe("generation job records", () => {
  test("create then get round-trips status and payload", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await insertActors(db, "Job Actor", { id: "actor-job-1", },);
      await createGenerationJobRecord(db, {
        id: "job-1",
        kind: "emotion-avatar",
        actorId: "actor-job-1",
        payload: { emotions: [EmotionType.Happy, EmotionType.Sad,], baseAvatarId: "av-1", },
        startedAt: "2026-09-11T00:00:00.000Z",
      },);
      const record = await getGenerationJobRecord(db, "job-1",);
      expect(record?.status,).toBe("running",);
      expect(record?.kind,).toBe("emotion-avatar",);
      expect(record?.payload.emotions,).toEqual(["happy", "sad",],);
      expect(record?.payload.baseAvatarId,).toBe("av-1",);
      expect(record?.results,).toEqual([],);
      expect(record?.completedAt,).toBeNull();
    } finally {
      sqlite.close();
    }
  });

  test("update to completed persists results", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await insertActors(db, "Job Actor", { id: "actor-job-2", },);
      await createGenerationJobRecord(db, {
        id: "job-2",
        kind: "emotion-avatar",
        actorId: "actor-job-2",
        payload: { emotions: [EmotionType.Happy,], baseAvatarId: "av-2", },
        startedAt: "2026-09-11T00:00:00.000Z",
      },);
      await updateGenerationJobRecord(db, "job-2", {
        status: "completed",
        results: [{ emotion: EmotionType.Happy, status: "completed", avatarId: "av-new", assetId: "as-new", },],
        completedAt: "2026-09-11T00:01:00.000Z",
      },);
      const record = await getGenerationJobRecord(db, "job-2",);
      expect(record?.status,).toBe("completed",);
      expect(record?.results,).toHaveLength(1,);
      expect(record?.results[0]?.assetId,).toBe("as-new",);
      expect(record?.completedAt,).toBe("2026-09-11T00:01:00.000Z",);
    } finally {
      sqlite.close();
    }
  });

  test("list is actor-scoped and newest first; unknown id misses", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await insertActors(db, "List Actor", { id: "actor-list-1", },);
      await insertActors(db, "Other Actor", { id: "actor-list-2", },);
      for (const id of ["job-a", "job-b",]) {
        await createGenerationJobRecord(db, {
          id,
          kind: "emotion-avatar",
          actorId: "actor-list-1",
          payload: { emotions: [], baseAvatarId: "av-x", },
          startedAt: "2026-09-11T00:00:00.000Z",
        },);
      }
      await createGenerationJobRecord(db, {
        id: "job-c",
        kind: "emotion-avatar",
        actorId: "actor-list-2",
        payload: { emotions: [], baseAvatarId: "av-x", },
        startedAt: "2026-09-11T00:00:00.000Z",
      },);
      const listed = await listGenerationJobRecords(db, "actor-list-1",);
      expect(listed.map((record,) => record.id),).toEqual(["job-b", "job-a",],);
      expect(await getGenerationJobRecord(db, "job-nope",),).toBeUndefined();
    } finally {
      sqlite.close();
    }
  });
});
