// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, resetTestDb, } from "../../test-utils/create-test-db";
import { insertNsfwUserPreferences, insertUsers, } from "../../test-utils/insert-helpers";
import { flagNsfwUserMessage, } from "./nsfw-user-flag";

createLogger({ level: "error", },);

let db: Kysely<DB>;
let sqlite: Database;

beforeAll(async () => {
  ({ db, sqlite, } = await createTestDb());
},);

afterAll(async () => {
  await db.destroy();
},);

beforeEach(async () => {
  resetTestDb(sqlite,);
  await insertUsers(db, "flagger", "Flagger", { id: "user-flagger", },);
},);

/**
 * @returns moderation_actions row count
 */
async function actionCount(): Promise<number> {
  const row = await db
    .selectFrom("moderation_actions",)
    .select(db.fn.countAll<number>().as("total",),)
    .executeTakeFirst();
  return row?.total ?? 0;
}

describe("flagNsfwUserMessage", () => {
  test("ignores clean content even with an sfw rating", async () => {
    await insertNsfwUserPreferences(db, "user-flagger", { max_rating: "sfw", },);
    await flagNsfwUserMessage(db, "user-flagger", "chat-1", "a sunny walk in the park",);
    expect(await actionCount(),).toBe(0,);
  });

  test("warns by default when no preferences row exists", async () => {
    await flagNsfwUserMessage(db, "user-flagger", "chat-1", "an explicit scene unfolds",);
    expect(await actionCount(),).toBe(1,);
    const row = await db
      .selectFrom("moderation_actions",)
      .select(["action_type", "target_user_id", "scope", "scope_id",],)
      .executeTakeFirst();
    expect(row?.action_type,).toBe("user_nsfw_warning",);
    expect(row?.target_user_id,).toBe("user-flagger",);
    expect(row?.scope,).toBe("chat",);
    expect(row?.scope_id,).toBe("chat-1",);
  });

  test("warns when the rating is below nsfw_intense", async () => {
    await insertNsfwUserPreferences(db, "user-flagger", { max_rating: "nsfw_mild", },);
    await flagNsfwUserMessage(db, "user-flagger", "chat-1", "brutal gore everywhere",);
    expect(await actionCount(),).toBe(1,);
  });

  test("stays silent when the rating already allows nsfw_intense", async () => {
    await insertNsfwUserPreferences(db, "user-flagger", { max_rating: "nsfw_intense", },);
    await flagNsfwUserMessage(db, "user-flagger", "chat-1", "brutal gore everywhere",);
    expect(await actionCount(),).toBe(0,);
  });

  test("stays silent for nsfw_extreme ratings", async () => {
    await insertNsfwUserPreferences(db, "user-flagger", { max_rating: "nsfw_extreme", },);
    await flagNsfwUserMessage(db, "user-flagger", "chat-1", "torture and mutilation",);
    expect(await actionCount(),).toBe(0,);
  });

  test("matches keywords case-insensitively", async () => {
    await insertNsfwUserPreferences(db, "user-flagger", { max_rating: "sfw", },);
    await flagNsfwUserMessage(db, "user-flagger", "chat-9", "GRAPHIC details",);
    expect(await actionCount(),).toBe(1,);
  });
});
