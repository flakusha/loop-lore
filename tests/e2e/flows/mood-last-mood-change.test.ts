// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E: Mood updates record last_mood_change
 *
 * `character_mood.last_mood_change` must move when the mood actually
 * changes: a happiness value that crosses a band boundary, or a new mood
 * label. Rewriting the same label (or nudging happiness inside one band) is
 * not a mood change and must leave the timestamp alone.
 *
 * Driven over HTTP through PUT /api/v1/actors/:actorId/mood; the row is read
 * back from the database.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type ApiClient, createClient, } from "../helpers/client";
import { SEED, seedAll, } from "../helpers/seed";
import { createTestServer, type TestServer, } from "../helpers/server";

/** Sentinel written to last_mood_change so "did not move" is unambiguous. */
const OLD_TIMESTAMP = "2000-01-01T00:00:00.000Z";

describe("Mood last_mood_change E2E", () => {
  let server: TestServer;
  let api: ApiClient;

  beforeAll(async () => {
    server = await createTestServer();
    await seedAll(server.db,);
    api = createClient(server.url,);

    expect(await api.loginAs(SEED.user.username, SEED.user.password,),).toBe(true,);

    const created = await api.post(`/api/v1/actors/${SEED.character.id}/mood`, {
      happiness: 50,
      baseMood: "neutral",
    },);

    expect(created.status,).toBe(201,);
  },);

  afterAll(async () => {
    await server.close();
  },);

  /**
   * Reset last_mood_change to the sentinel value.
   */
  async function resetTimestamp(): Promise<void> {
    await server.db
      .updateTable("character_mood",)
      .set({ last_mood_change: OLD_TIMESTAMP, },)
      .where("actor_id", "=", SEED.character.id,)
      .execute();
  }

  /**
   * Read the persisted last_mood_change value.
   * @returns the stored timestamp
   */
  async function readTimestamp(): Promise<string | null> {
    const row = await server.db
      .selectFrom("character_mood",)
      .select("last_mood_change",)
      .where("actor_id", "=", SEED.character.id,)
      .executeTakeFirst();

    return row?.last_mood_change ?? null;
  }

  test("a happiness change that crosses a band boundary moves last_mood_change", async () => {
    await resetTimestamp();

    // 50 -> 90 crosses neutral -> ecstatic.
    const res = await api.put(`/api/v1/actors/${SEED.character.id}/mood`, { happiness: 90, },);
    expect(res.status,).toBe(200,);

    expect(await readTimestamp(),).not.toBe(OLD_TIMESTAMP,);
  });

  test("rewriting the same mood label leaves last_mood_change alone", async () => {
    await resetTimestamp();

    const res = await api.put(`/api/v1/actors/${SEED.character.id}/mood`, { currentMood: "neutral", },);
    expect(res.status,).toBe(200,);

    expect(await readTimestamp(),).toBe(OLD_TIMESTAMP,);
  });
});
