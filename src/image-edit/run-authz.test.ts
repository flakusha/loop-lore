// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Direct unit tests for `authorizeRunLinkage` (`src/image-edit/run-authz.ts`)
 * — the authz choke point the export-gap ratchet flagged. Route-level 401/
 * 403 coverage exists in `routes.coverage.test.ts`; these pin the export
 * itself: owner-linked run → allow (null), other-user run id → deny (403),
 * missing run → deny fail-closed (403, no throw).
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { MessageRole, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../test-utils/insert-helpers";
import { authorizeRunLinkage, } from "./run-authz";

let db: Kysely<DB>;

const OWNER = "run-authz-owner";
const STRANGER = "run-authz-stranger";
const CHAT = "run-authz-chat";
const FOREIGN_CHAT = "run-authz-foreign-chat";
const MESSAGE = "run-authz-message";
const FOREIGN_MESSAGE = "run-authz-foreign-message";

beforeEach(async () => {
  ({ db, } = await createTestDb());
  await insertUsers(db, OWNER, "Run Authz Owner", { id: OWNER as never, },);
  await insertUsers(db, STRANGER, "Run Authz Stranger", { id: STRANGER as never, },);
  await insertActors(db, "Owner Actor", { id: OWNER as never, actor_type: "user" as never, },);
  await insertActors(db, "Stranger Actor", { id: STRANGER as never, actor_type: "user" as never, },);
  await insertChats(db, "Own Chat", OWNER, { id: CHAT as never, },);
  await insertChats(db, "Foreign Chat", STRANGER, { id: FOREIGN_CHAT as never, },);
  await insertChatParticipants(db, CHAT, OWNER, { role_in_chat: "owner", },);
  await insertChatParticipants(db, FOREIGN_CHAT, STRANGER, { role_in_chat: "owner", },);
  await insertMessages(db, CHAT, OWNER, MessageRole.User, "edit me", { id: MESSAGE as never, },);
  await insertMessages(db, FOREIGN_CHAT, STRANGER, MessageRole.User, "not yours", {
    id: FOREIGN_MESSAGE as never,
  },);
},);

afterEach(async () => {
  await db.destroy();
},);

describe("authorizeRunLinkage", () => {
  test("owner-linked chat run → allow (null)", async () => {
    const res = await authorizeRunLinkage(
      { chatId: CHAT, },
      { database: db, userId: OWNER, userRole: "user", },
    );

    expect(res,).toBeNull();
  });

  test("owner-linked message run → allow (null)", async () => {
    const res = await authorizeRunLinkage(
      { messageId: MESSAGE, },
      { database: db, userId: OWNER, userRole: "user", },
    );

    expect(res,).toBeNull();
  });

  test("other-user chat id → deny (403)", async () => {
    const res = await authorizeRunLinkage(
      { chatId: FOREIGN_CHAT, },
      { database: db, userId: OWNER, userRole: "user", },
    );

    expect(res,).toBeInstanceOf(Response,);
    expect(res?.status,).toBe(403,);
  });

  test("other-user message id → deny (403)", async () => {
    const res = await authorizeRunLinkage(
      { messageId: FOREIGN_MESSAGE, },
      { database: db, userId: OWNER, userRole: "user", },
    );

    expect(res,).toBeInstanceOf(Response,);
    expect(res?.status,).toBe(403,);
  });

  test("missing run id → deny fail-closed (403, no throw)", async () => {
    const res = await authorizeRunLinkage(
      { messageId: "run-authz-no-such-message", },
      { database: db, userId: OWNER, userRole: "user", },
    );

    expect(res,).toBeInstanceOf(Response,);
    expect(res?.status,).toBe(403,);
  });

  test("missing userId → deny (401)", async () => {
    const res = await authorizeRunLinkage({ chatId: CHAT, }, {},);

    expect(res,).toBeInstanceOf(Response,);
    expect(res?.status,).toBe(401,);
  });
});
