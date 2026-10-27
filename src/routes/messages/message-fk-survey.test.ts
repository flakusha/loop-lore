// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { MessageRole, } from "../../db/enums";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertChats, insertMessages, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { structuralReferences, } from "./message-fk-survey";

describe("message FK survey", () => {
  test("blocks a candidate that a surviving row still references", async () => {
    const { db, } = await createTestDb();
    const owner = uid();
    await insertUsers(db, `user-${owner}`, "Survey Owner", { id: owner, } as never,);
    await db
      .insertInto("actors",)
      .values({
        id: owner,
        actor_type: "user",
        display_name: "Survey Owner",
        user_id: owner,
        owner_id: owner,
        agent_type: "none",
        settings: "{}",
        row_version: 0,
        visibility: "private",
        import_spec: "{}",
      },)
      .execute();

    const chatId = await insertChats(db, "Survey Chat", owner,);
    const parentId = await insertMessages(db, chatId, owner, MessageRole.User, "parent",);
    const childId = await insertMessages(db, chatId, owner, MessageRole.User, "child", {
      parent_id: parentId,
    },);

    const otherId = await insertMessages(db, chatId, owner, MessageRole.User, "other",);

    // The child is not purged, so it still points at the parent: the parent
    // is structural and must survive.
    const blocked = await structuralReferences(db, [parentId, otherId,],);

    expect(blocked.has(parentId,),).toBe(true,);
    // Nothing points at the unreferenced message.
    expect(blocked.has(otherId,),).toBe(false,);

    // A child inside the purge set is deleted first (leaf-first), so it does
    // not make its parent structural.
    const withChild = await structuralReferences(db, [parentId, childId, otherId,],);

    expect(withChild.has(parentId,),).toBe(false,);
  });
});
