// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { createChat, } from "../../chat/service";
import type { AssistantWorkflowConfig, } from "../../config/sections/templates";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../../test-utils/insert-helpers";
import { handoffToEntityCreationChat, } from "./handoff";

const WORKFLOWS: readonly AssistantWorkflowConfig[] = [
  {
    id: "entity-character",
    name: "Guided character creation",
    steps: [
      { id: "name", name: "Name", type: "text", formatTemplate: "Name: {value}", },
    ],
    dispatch: { backend: "assistant-create", target: "/create char", payloadTemplate: { description: "{prompt}", }, },
    approval: { type: "confirm", preview: true, },
  },
];

describe("handoffToEntityCreationChat", () => {
  let db: Kysely<DB>;

  beforeEach(async () => {
    const fresh = await createTestDb();
    db = fresh.db;
    await insertUsers(db, "creator", "Creator", { id: "user-create", } as never,);
    await insertActors(
      db,
      "Creator",
      { id: "user-create", user_id: "user-create", owner_id: "user-create", } as never,
    );
  },);

  afterEach(async () => {
    await db?.destroy();
  },);

  /** Base options for a character handoff from a real source chat. */
  async function opts(overrides: Partial<Parameters<typeof handoffToEntityCreationChat>[1]> = {},) {
    const sourceChatId = await createChat(db, {
      name: "Source story chat",
      createdBy: "user-create",
    },);
    return {
      kind: "character",
      seed: "Aldric\nA hooded stranger seen at the tavern.",
      sourceChatId,
      userId: "user-create",
      workflows: WORKFLOWS,
      ...overrides,
    };
  }

  test("creates a private seeded creation chat with a workflow session", async () => {
    const sourceChatId = await opts();
    const result = await handoffToEntityCreationChat(db, sourceChatId,);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }

    const { chatId, descriptor, workflow, } = result.value;
    expect(descriptor.kind,).toBe("character",);
    expect(workflow.id,).toBe("entity-character",);

    const chat = await db
      .selectFrom("chats",)
      .where("id", "=", chatId,)
      .select(["name", "visibility", "parent_chat_id", "created_by",],)
      .executeTakeFirst();
    expect(chat,).toBeDefined();
    expect(chat!.name,).toBe("Character creation: Aldric",);
    expect(chat!.visibility,).toBe("private",);
    expect(chat!.parent_chat_id,).toBe(sourceChatId.sourceChatId,);
    expect(chat!.created_by,).toBe("user-create",);

    // Seed message present and system-voiced.
    const seed = await db
      .selectFrom("messages",)
      .where("chat_id", "=", chatId,)
      .selectAll()
      .executeTakeFirst();
    expect(seed,).toBeDefined();
    expect(seed!.role,).toBe("system",);
    expect(seed!.content,).toContain("Aldric",);

    // Session persisted write-through for restart safety.
    const session = await db
      .selectFrom("workflow_sessions",)
      .where("chat_id", "=", chatId,)
      .selectAll()
      .executeTakeFirst();
    expect(session,).toBeDefined();
    expect(session!.workflow_id,).toBe("entity-character",);
  });

  test("rejects unknown kinds without creating anything", async () => {
    const result = await handoffToEntityCreationChat(db, await opts({ kind: "npc", },),);
    expect(result,).toEqual({ ok: false, code: "unknown_kind", message: "Unknown entity kind: npc", },);
  });

  test("rejects when the kind's workflow template is not loaded", async () => {
    const result = await handoffToEntityCreationChat(db, await opts({ workflows: [], },),);
    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.code,).toBe("unknown_workflow",);
  });
});
