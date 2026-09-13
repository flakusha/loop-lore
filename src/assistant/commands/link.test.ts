// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { AssetLinkEntity, MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertAssets, insertChats, insertMessages, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { resolveLinkPreview, } from "./link";
import { getCommand, } from "./registry";
describe("resolveLinkPreview", () => {
  let db: Kysely<DB>;
  let ownerId: string;
  let otherId: string;
  let chatId: string;
  let otherChatId: string;
  let assetId: string;
  let messageId: string;
  let foreignMessageId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    ownerId = uid();
    otherId = uid();
    await insertUsers(db, `user-${ownerId}`, "Owner", { id: ownerId, } as never,);
    await insertUsers(db, `user-${otherId}`, "Other", { id: otherId, } as never,);
    for (const id of [ownerId, otherId,]) {
      await db
        .insertInto("actors",)
        .values({
          id,
          actor_type: "user",
          display_name: id,
          user_id: id,
          owner_id: id,
          agent_type: "none",
          settings: "{}",
          format_version: 0,
          visibility: "private",
          import_spec: "{}",
        },)
        .execute();
    }

    chatId = uid();
    otherChatId = uid();
    await insertChats(db, "Link Chat", ownerId, { id: chatId, } as never,);
    await insertChats(db, "Other Chat", ownerId, { id: otherChatId, } as never,);

    assetId = uid();
    await insertAssets(db, ownerId, "castle.png", "image/png", "image", 1024, "/tmp/castle.png", {
      id: assetId,
    },);

    messageId = uid();
    await insertMessages(db, chatId, ownerId, MessageRole.User, "hello", {
      id: messageId,
      swipe_index: 0,
    } as never,);
    foreignMessageId = uid();
    await insertMessages(db, otherChatId, ownerId, MessageRole.User, "hello", {
      id: foreignMessageId,
      swipe_index: 0,
    } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("resolves a chat target for the owner's asset", async () => {
    const result = await resolveLinkPreview(db, ownerId, chatId, assetId,);
    expect(result.ok,).toBe(true,);
    if (result.ok) {
      expect(result.preview.entityType,).toBe(AssetLinkEntity.Chat,);
      expect(result.preview.entityId,).toBe(chatId,);
      expect(result.preview.filename,).toBe("castle.png",);
    }
  });

  test("resolves a message target in the same chat", async () => {
    const result = await resolveLinkPreview(db, ownerId, chatId, assetId, messageId,);
    expect(result.ok,).toBe(true,);
    if (result.ok) {
      expect(result.preview.entityType,).toBe(AssetLinkEntity.Message,);
      expect(result.preview.entityId,).toBe(messageId,);
    }
  });

  test("rejects a missing asset", async () => {
    const result = await resolveLinkPreview(db, ownerId, chatId, "nope",);
    expect(result.ok,).toBe(false,);
  });

  test("rejects a non-owner", async () => {
    const result = await resolveLinkPreview(db, otherId, chatId, assetId,);
    expect(result.ok,).toBe(false,);
  });

  test("rejects a message from a different chat", async () => {
    const result = await resolveLinkPreview(db, ownerId, chatId, assetId, foreignMessageId,);
    expect(result.ok,).toBe(false,);
  });

  test("registered /link returns the confirm action without persisting", async () => {
    const handler = getCommand("link",);
    expect(handler,).toBeDefined();
    const result = await handler!([assetId,], { chatId, db, userId: ownerId, config: {} as Config, },);
    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("link-asset",);
    const links = await db.selectFrom("asset_links",).selectAll().execute();
    expect(links,).toHaveLength(0,);
  });

  test("registered /link shows usage with no args", async () => {
    const handler = getCommand("link",);
    const result = await handler!([], { chatId, db, userId: ownerId, config: {} as Config, },);
    expect(result.handled,).toBe(true,);
    expect(result.action,).toBeUndefined();
  });
});
