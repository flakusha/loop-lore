// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Guard + response-helper tests for `src/routes/scheduled/guards.ts` — the
 * five export gaps the ratchet flagged. Route-tested only through happy
 * paths; these pin the denial mapping directly: no userId → 401,
 * non-member chat → 404/403 via `serviceErrorToResponse` mapping,
 * `forbidden` service error → 403, `respond({ok:true})` → 200 (not 204).
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import {
  requireChatAccess,
  requireUser,
  respond,
  scheduledError,
  withChat,
} from "./guards";

let db: Kysely<DB>;

const OWNER = "guards-owner";
const STRANGER = "guards-stranger";
const CHAT = "guards-chat";

beforeEach(async () => {
  ({ db, } = await createTestDb());
  await insertUsers(db, OWNER, "Guards Owner", { id: OWNER as never, },);
  await insertUsers(db, STRANGER, "Guards Stranger", { id: STRANGER as never, },);
  await insertChats(db, "Guards Chat", OWNER, { id: CHAT as never, },);
},);

afterEach(async () => {
  await db.destroy();
},);

describe("requireUser", () => {
  test("no userId → 401", async () => {
    const res = requireUser({ userId: null, },);

    expect(res,).toBeInstanceOf(Response,);
    expect((res as Response).status,).toBe(401,);
  });

  test("userId → caller", async () => {
    expect(requireUser({ userId: OWNER, },),).toEqual({ userId: OWNER, },);
  });
});

describe("requireChatAccess", () => {
  test("no userId → 401", async () => {
    const res = await requireChatAccess(db, { userId: null, userRole: "user", }, CHAT,);

    expect(res,).toBeInstanceOf(Response,);
    expect((res as Response).status,).toBe(401,);
  });

  test("non-member chat → 404 (chat-hiding, not 403)", async () => {
    const res = await requireChatAccess(db, { userId: STRANGER, userRole: "user", }, CHAT,);

    expect(res,).toBeInstanceOf(Response,);
    expect((res as Response).status,).toBe(404,);
  });

  test("member chat → caller", async () => {
    const res = await requireChatAccess(db, { userId: OWNER, userRole: "user", }, CHAT,);

    expect(res,).toEqual({ userId: OWNER, },);
  });
});

describe("scheduledError", () => {
  test("forbidden service error → 404 (row-existence hiding)", async () => {
    const res = scheduledError({ code: "forbidden", message: "nope", },);

    expect(res.status,).toBe(404,);
  });

  test("bad_request → 400", async () => {
    const res = scheduledError({ code: "bad_request", message: "bad", },);

    expect(res.status,).toBe(400,);
  });

  test("not_found → 404", async () => {
    const res = scheduledError({ code: "not_found", message: "gone", },);

    expect(res.status,).toBe(404,);
  });
});

describe("respond", () => {
  test("{ok:true} → 200 (not 204)", async () => {
    const res = respond({ ok: true, },);

    expect(res.status,).toBe(200,);
  });

  test("forbidden service error → 404 via mapping", async () => {
    const res = respond({ code: "forbidden", message: "nope", },);

    expect(res.status,).toBe(404,);
  });
});

describe("withChat", () => {
  test("unauthorized caller short-circuits before the handler", async () => {
    let reached = false;
    const wrapped = withChat(db, async () => {
      reached = true;
      return respond({ ok: true, },);
    },);

    const res = await wrapped({ userId: STRANGER, userRole: "user", params: { id: CHAT, }, },);

    expect(res.status,).toBe(404,);
    expect(reached,).toBe(false,);
  });

  test("authorized caller reaches the handler", async () => {
    const wrapped = withChat(db, async (_ctx, _chatId, _caller,) => {
      return respond({ ok: true, },);
    },);

    const res = await wrapped({ userId: OWNER, userRole: "user", params: { id: CHAT, }, },);

    expect(res.status,).toBe(200,);
  });
});
