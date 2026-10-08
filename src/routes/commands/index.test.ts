// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the GET /api/commands registry route.
 * (WIRE-assistant-command-palette-stale-static-list)
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { Elysia, } from "elysia";
import { randomUUID, } from "node:crypto";
import {
  listCommands,
  registerCommand,
} from "../../assistant/commands/registry";
import { ChatParticipantRole, } from "../../db/enums";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChatParticipants, insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { commandsRoutes, } from "./index";

const TEST_COMMAND = "routes-test-cmd";
const OTHER_TEST_COMMAND = "routes-test-other";

function makeApp(userId: string | null,) {
  const app = new Elysia({ name: "test-commands", },);
  if (userId) { app.derive(() => ({ userId, userRole: "member", })); }
  return app.use(commandsRoutes({},),);
}

describe("GET /api/commands", () => {
  beforeEach(() => {
    if (!listCommands().includes(TEST_COMMAND,)) {
      registerCommand(TEST_COMMAND, () => ({ handled: true, }),);
    }

    if (!listCommands().includes(OTHER_TEST_COMMAND,)) {
      registerCommand(OTHER_TEST_COMMAND, () => ({ handled: true, }),);
    }
  },);

  afterEach(() => {
    // Tests only assert on command *list membership* via name/descriptionKey;
    // any registration done by a prior test that we don't want to leak can
    // be left in the registry — the route returns whatever is registered.
  },);

  it("requires authentication", async () => {
    const app = makeApp(null,);
    const res = await app.handle(new Request("http://localhost/api/commands",),);
    expect(res.status,).toBe(401,);
    const body = await res.json() as { error?: string };
    expect(typeof body.error,).toBe("string",);
  });

  it("returns the live registry with description keys", async () => {
    const app = makeApp("user-1",);
    const res = await app.handle(new Request("http://localhost/api/commands",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: { name: string; descriptionKey: string }[] };
    expect(Array.isArray(body.data,),).toBe(true,);
    const names = body.data.map((entry,) => entry.name);
    expect(names,).toContain(TEST_COMMAND,);
    expect(names,).toContain(OTHER_TEST_COMMAND,);
    for (const entry of body.data) {
      expect(entry.descriptionKey,).toBe(`commands.${entry.name}`,);
    }
  });

  it("includes new commands without an FE rebuild", async () => {
    const app = makeApp("user-1",);
    const freshName = `fresh-cmd-${Date.now()}`;
    registerCommand(freshName, () => ({ handled: true, }),);
    const res = await app.handle(new Request("http://localhost/api/commands",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: { name: string; descriptionKey: string }[] };
    expect(body.data.map((entry,) => entry.name),).toContain(freshName,);
  });

  it("excludes stub commands registered with available:false", async () => {
    const app = makeApp("user-1",);
    const stubName = `stub-cmd-${Date.now()}`;
    registerCommand(stubName, () => ({ handled: true, }), { available: false, },);
    const res = await app.handle(new Request("http://localhost/api/commands",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: { name: string; descriptionKey: string }[] };
    const names = body.data.map((entry,) => entry.name);
    expect(names,).not.toContain(stubName,);
  });

  it("attaches requiredRole + roleInChat for a member-scoped request", async () => {
    const tdb: TestDb = await createTestDb();
    try {
      const ownerId = randomUUID();
      const memberId = randomUUID();
      const chatId = randomUUID();
      await insertUsers(tdb.db, `owner-${ownerId}`, "Owner", { id: ownerId, } as never,);
      await insertUsers(tdb.db, `member-${memberId}`, "Member", { id: memberId, } as never,);
      await insertActors(tdb.db, "Owner", { id: ownerId, user_id: ownerId, owner_id: ownerId, } as never,);
      await insertActors(tdb.db, "Member", { id: memberId, user_id: memberId, owner_id: memberId, } as never,);
      await insertChats(tdb.db, "Role Chat", ownerId, { id: chatId, } as never,);
      await insertChatParticipants(tdb.db, chatId, ownerId, { role_in_chat: ChatParticipantRole.Owner, } as never,);
      await insertChatParticipants(tdb.db, chatId, memberId, { role_in_chat: ChatParticipantRole.Member, } as never,);
      const ownerGated = `owner-gated-${Date.now()}`;
      registerCommand(ownerGated, () => ({ handled: true, }), { requiredRole: ChatParticipantRole.Owner, },);

      const app = new Elysia({ name: "test-commands-scoped", },)
        .derive(() => ({ userId: memberId, userRole: "member", }))
        .use(commandsRoutes({ database: tdb.db, },),);

      const res = await app.handle(new Request(`http://localhost/api/commands?chatId=${chatId}`,),);
      expect(res.status,).toBe(200,);
      const body = await res.json() as {
        data: { name: string; descriptionKey: string; requiredRole?: string }[];
        roleInChat?: string;
      };

      expect(body.roleInChat,).toBe("member",);
      const gated = body.data.find((entry,) => entry.name === ownerGated);
      expect(gated?.requiredRole,).toBe("owner",);
      const open = body.data.find((entry,) => entry.name === TEST_COMMAND);
      expect(open && "requiredRole" in open,).toBe(false,);
    } finally {
      await tdb.db.destroy();
    }
  });

  it("fails open to the unscoped list for an unknown chat", async () => {
    const tdb: TestDb = await createTestDb();
    try {
      const app = new Elysia({ name: "test-commands-unknown", },)
        .derive(() => ({ userId: "user-1", userRole: "member", }))
        .use(commandsRoutes({ database: tdb.db, },),);

      const res = await app.handle(new Request("http://localhost/api/commands?chatId=chat-missing",),);
      expect(res.status,).toBe(200,);
      const body = await res.json() as { data: unknown[]; roleInChat?: string };
      expect(Array.isArray(body.data,),).toBe(true,);
      expect(body.roleInChat,).toBeUndefined();
    } finally {
      await tdb.db.destroy();
    }
  });
});
