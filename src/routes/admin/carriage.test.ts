// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin carriage route tests (TASK-chat-feature-notes-shadow-carriage AC3).
 *
 * Carriage records are visible to admins only: admin 200, non-admin 403,
 * unknown chat 404 — and the participant-facing annotations endpoint never
 * leaks carriage payloads.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { listCarriage, recordCarriage, } from "../../chat/service/carriage";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import { ShadowNoteType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertCarriageRecords,
  insertChatParticipants,
  insertChats,
  insertShadowNotes,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { safeJsonParse, } from "../../utils";
import { CARRIAGE_REPAIR_HINT, } from "../../utils/structured-output";
import { annotationRoutes, } from "../chats/annotations";
import { carriageRoutes, } from "./carriage";

const BASE = "http://localhost";
let db: Kysely<DB>;
let adminId: string;
let userId: string;
let chatId: string;
let debugChatId: string;
let offChatId: string;
let badVerdictChatId: string;
const MARKER = "dev-only-carriage-marker";
/** Canonical carriage doc stored for the debug-view chat. */
const DEBUG_TOML = [
  "episode = 4",
  'title = "The Sleeper\'s Warning"',
  "[[characters]]",
  'name = "K"',
  'status = "Inside the ruin"',
].join("\n",);

/** Build an app whose auth derive reflects the given role. */
function makeApp(role: string, id: string,): Elysia {
  const app = new Elysia({ name: "test-admin-carriage", },);
  app.derive(() => ({ userId: id, userRole: role, }));
  return app.use(
    carriageRoutes({ database: db, config: createConfigSchema().defaults as Config, }, "/api",),
  ) as unknown as Elysia;
}

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, } = await createTestDb());
  adminId = crypto.randomUUID();
  userId = crypto.randomUUID();
  await insertUsers(db, "admin", "Admin", { id: adminId, } as never,);
  await insertUsers(db, "member", "Member", { id: userId, } as never,);
  await insertActors(db, "Member", {
    id: userId,
    user_id: userId,
    owner_id: userId,
  } as never,);

  chatId = crypto.randomUUID();
  await insertChats(db, "Carriage Route Chat", adminId, { id: chatId, } as never,);
  await insertChatParticipants(db, chatId, userId, { role_in_chat: "member", },);
  await recordCarriage(db, {
    chatId,
    scope: "session",
    payload: { note: MARKER, },
  },);

  // Dev/debug `?` view seeds (TASK-shadow-visibility-debug-assistant).
  debugChatId = crypto.randomUUID();
  await insertChats(db, "Carriage Debug Chat", adminId, {
    id: debugChatId,
    gm_config: JSON.stringify({ carriageEnabled: true, },),
  } as never,);

  await insertCarriageRecords(
    db,
    debugChatId,
    "carriage",
    JSON.stringify({ toml: DEBUG_TOML, },),
    new Date().toISOString(),
  );

  await insertShadowNotes(db, debugChatId, ShadowNoteType.WorldSecret, "Debug-visible secret", "2026-01-01T00:00:00Z",);
  await insertShadowNotes(db, debugChatId, ShadowNoteType.Foreshadowing, "Second hidden note", "2026-01-02T00:00:00Z",);

  // Carriage toggle never set → carriageEnabled false, no latest, no verdict.
  offChatId = crypto.randomUUID();
  await insertChats(db, "Carriage Off Chat", adminId, { id: offChatId, } as never,);

  // Schema-violating latest payload → cancel verdict in the debug view.
  badVerdictChatId = crypto.randomUUID();
  await insertChats(db, "Carriage Bad Verdict Chat", adminId, { id: badVerdictChatId, } as never,);
  await insertCarriageRecords(
    db,
    badVerdictChatId,
    "carriage",
    JSON.stringify({ toml: 'characters = ["K", "G"]', },),
    new Date().toISOString(),
  );
},);

afterAll(async () => {
  await db.destroy();
},);

describe("GET /api/admin/chats/:id/carriage", () => {
  test("admin sees carriage records", async () => {
    const app = makeApp("admin", adminId,);
    const res = await app.handle(
      new Request(`${BASE}/api/admin/chats/${chatId}/carriage`,),
    );

    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { data: Array<{ scope: string; payload: string }> };
    expect(body.data,).toHaveLength(1,);
    expect(body.data[0]?.scope,).toBe("session",);
    expect(body.data[0]?.payload,).toContain(MARKER,);
  });

  test("non-admin is forbidden", async () => {
    const app = makeApp("user", userId,);
    const res = await app.handle(
      new Request(`${BASE}/api/admin/chats/${chatId}/carriage`,),
    );

    expect(res.status,).toBe(403,);
  });

  test("unknown chat is a 404", async () => {
    const app = makeApp("admin", adminId,);
    const res = await app.handle(
      new Request(`${BASE}/api/admin/chats/${crypto.randomUUID()}/carriage`,),
    );

    expect(res.status,).toBe(404,);
  });

  test("participant annotations endpoint never carries the payload", async () => {
    const app = new Elysia({ name: "test-annotations-leak", },);
    app.derive(() => ({ userId, userRole: "member", }));
    const wired = app.use(
      annotationRoutes(
        {
          database: db,
          config: createConfigSchema().defaults as Config,
        },
        "/api",
      ),
    ) as unknown as Elysia;

    const res = await wired.handle(
      new Request(`${BASE}/api/chats/${chatId}/annotations`,),
    );

    expect(res.status,).toBe(200,);
    const text = await res.text();
    expect(text,).not.toContain(MARKER,);
    // The carriage row itself exists and is only reachable via listCarriage.
    expect(await listCarriage(db, chatId,),).toHaveLength(1,);
  });
});

describe("GET /api/admin/chats/:id/carriage/debug", () => {
  test("non-admin is forbidden", async () => {
    const app = makeApp("user", userId,);
    const res = await app.handle(
      new Request(`${BASE}/api/admin/chats/${debugChatId}/carriage/debug`,),
    );

    expect(res.status,).toBe(403,);
  });

  test("unknown chat is a 404", async () => {
    const app = makeApp("admin", adminId,);
    const res = await app.handle(
      new Request(`${BASE}/api/admin/chats/${crypto.randomUUID()}/carriage/debug`,),
    );

    expect(res.status,).toBe(404,);
  });

  test("admin gets toggle state, latest record, verdict, and gm-labeled shadow notes", async () => {
    const app = makeApp("admin", adminId,);
    const res = await app.handle(
      new Request(`${BASE}/api/admin/chats/${debugChatId}/carriage/debug`,),
    );

    expect(res.status,).toBe(200,);
    const body = (await res.json()) as {
      data: {
        chatId: string;
        carriageEnabled: boolean;
        latest: { scope: string; payload: string } | null;
        verdict:
          | null
          | (
            | { ok: true; healed: boolean; hash: string }
            | { ok: false; reason: string; hint: string }
          );
        shadowNotes: { id: string; type: string; content: string; visibility: string }[];
      };
    };

    expect(body.data.chatId,).toBe(debugChatId,);
    expect(body.data.carriageEnabled,).toBe(true,);
    expect(body.data.latest?.scope,).toBe("carriage",);
    const payload = safeJsonParse<{ toml: string }>(body.data.latest?.payload ?? "",);
    expect(payload.ok,).toBe(true,);
    if (payload.ok) { expect(payload.value.toml,).toBe(DEBUG_TOML,); }
    expect(body.data.verdict?.ok,).toBe(true,);
    if (body.data.verdict?.ok) {
      expect(typeof body.data.verdict.hash,).toBe("string",);
    }

    // Every shadow entry carries its gm label with a synthetic id.
    expect(body.data.shadowNotes,).toHaveLength(2,);
    expect(body.data.shadowNotes[0],).toEqual({
      id: "shadow-0",
      type: ShadowNoteType.WorldSecret,
      content: "Debug-visible secret",
      visibility: "gm",
    },);

    expect(body.data.shadowNotes[1]?.id,).toBe("shadow-1",);
    expect(body.data.shadowNotes[1]?.visibility,).toBe("gm",);
  });

  test("schema-violating payload surfaces the cancel verdict with the repair hint", async () => {
    const app = makeApp("admin", adminId,);
    const res = await app.handle(
      new Request(`${BASE}/api/admin/chats/${badVerdictChatId}/carriage/debug`,),
    );

    expect(res.status,).toBe(200,);
    const body = (await res.json()) as {
      data: {
        carriageEnabled: boolean;
        verdict: null | { ok: boolean; reason: string; hint: string };
      };
    };

    expect(body.data.carriageEnabled,).toBe(false,);
    expect(body.data.verdict,).toEqual({
      ok: false,
      reason: "schema_violation",
      hint: CARRIAGE_REPAIR_HINT,
    },);
  });

  test("carriage-off chat reads disabled with no record and no verdict", async () => {
    const app = makeApp("admin", adminId,);
    const res = await app.handle(
      new Request(`${BASE}/api/admin/chats/${offChatId}/carriage/debug`,),
    );

    expect(res.status,).toBe(200,);
    const body = (await res.json()) as {
      data: {
        carriageEnabled: boolean;
        latest: unknown;
        verdict: unknown;
        shadowNotes: unknown[];
      };
    };

    expect(body.data.carriageEnabled,).toBe(false,);
    expect(body.data.latest,).toBeNull();
    expect(body.data.verdict,).toBeNull();
    expect(body.data.shadowNotes,).toEqual([],);
  });
});
