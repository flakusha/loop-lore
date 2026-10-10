// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for the chat-buffer module split out of bdi-nightly. */
import { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db";
import { createInMemoryDb, } from "./__helpers/in-mem-db";
import { newId, recordChatTurn, } from "./chat-buffer";

let db: Kysely<DB>;
let raw: Database;

beforeEach(async () => {
  ({ db, raw, } = await createInMemoryDb());
},);

afterEach(() => {
  raw.close();
},);

describe("chat-buffer", () => {
  test("newId returns a 32-char lowercase hex id", async () => {
    const id = await newId(db,);
    expect(id,).toMatch(/^[0-9a-f]{32}$/,);
  });

  test("first chat with a partner is allowed and seeds the buffer defaults", async () => {
    const first = await recordChatTurn(db, "a1", "a2",);
    expect(first.allowed,).toBe(true,);

    const row = raw.query("SELECT cooldown_minutes, max_consecutive_chats, consecutive_count FROM actor_chat_buffers",)
      .get() as {
        cooldown_minutes: number;
        max_consecutive_chats: number;
        consecutive_count: number;
      };

    expect(row.cooldown_minutes,).toBe(15,);
    expect(row.max_consecutive_chats,).toBe(3,);
    expect(row.consecutive_count,).toBe(1,);
  });

  test("an immediate second chat is denied by the cooldown", async () => {
    const now = new Date("2026-10-10T12:00:00Z",);
    const first = await recordChatTurn(db, "a1", "a2", now,);
    expect(first.allowed,).toBe(true,);

    const second = await recordChatTurn(db, "a1", "a2", new Date(now.getTime() + 60_000,),);
    expect(second.allowed,).toBe(false,);
    expect(second.reason,).toBe("cooldown_active",);
    expect(second.cooldownRemainingMs,).toBe(14 * 60_000,);
  });
});
