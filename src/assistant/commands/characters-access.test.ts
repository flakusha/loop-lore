// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the character commands: /char-list, /char-get, /char-update.
 *
 * Characters have no world scope, so the guard under test is `actors.owner_id`:
 * another user's character is neither listed nor readable, and the refusal is
 * worded identically to "no such character".
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { ActorType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActorLoreEntries,
  insertActors,
  insertCharacterStats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import type { CommandContext, CommandHandler, } from "./registry";
import { getCommand, } from "./registry";

// Named import doubles as the side-effect import: the handlers register
// themselves on module load.
import { parseCharacterUpdates, } from "./characters-access";

function mustGet(name: string,): CommandHandler {
  const handler = getCommand(name,);
  if (!handler) { throw new Error(`command not registered: ${name}`,); }
  return handler;
}

const charList = mustGet("char-list",);
const charGet = mustGet("char-get",);
const charUpdate = mustGet("char-update",);

describe("character commands", () => {
  let db: Kysely<DB>;
  let ownerId: string;
  let otherId: string;
  let charId: string;

  const ctx = (overrides?: Partial<CommandContext>,): CommandContext => ({
    chatId: "chat-1",
    db,
    userId: ownerId,
    ...overrides,
  });

  beforeAll(async () => {
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  beforeEach(async () => {
    for (const table of ["actor_lore_entries", "character_stats", "actors", "users",] as const) {
      await db.deleteFrom(table,).execute();
    }

    ownerId = `user-${crypto.randomUUID()}`;
    otherId = `user-${crypto.randomUUID()}`;
    await insertUsers(db, `owner-${ownerId}`, "Owner", { id: ownerId, },);
    await insertUsers(db, `other-${otherId}`, "Other", { id: otherId, },);

    charId = await insertActors(db, "Iria", {
      actor_type: ActorType.Character,
      owner_id: ownerId,
      agent_type: "ai",
      description: "A weathered scout.",
      personality: "Wry, watchful.",
      appearance: "Weathered leathers.",
      default_outfit: "Scout kit.",
      scenario: "At the ash gate.",
      character_version: "1.2",
    },);
  },);

  // ── /char-list ────────────────────────────────────────────

  test("lists the characters the caller owns", async () => {
    const result = await charList([], ctx(),);
    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("char-list",);
    expect(result.systemMessage,).toContain("Iria",);
    expect(result.systemMessage,).toContain("A weathered scout.",);
    expect(result.actionPayload!.characters as unknown[],).toHaveLength(1,);
  });

  test("never lists another user's characters", async () => {
    await insertActors(db, "Theirs", { actor_type: ActorType.Character, owner_id: otherId, },);
    const result = await charList([], ctx(),);
    expect(result.systemMessage,).not.toContain("Theirs",);
  });

  test("ignores actors that are not characters", async () => {
    await insertActors(db, "Narrator Voice", { actor_type: ActorType.Narrator, owner_id: ownerId, },);
    const result = await charList([], ctx(),);
    expect(result.systemMessage,).not.toContain("Narrator Voice",);
  });

  test("reports when the caller owns nothing", async () => {
    await db.deleteFrom("actors",).execute();
    expect((await charList([], ctx(),)).systemMessage,).toBe("You own no characters yet.",);
  });

  test("reports missing context instead of throwing", async () => {
    expect((await charList([], { chatId: "chat-1", db, },)).systemMessage,).toContain("command context has no user",);
    expect((await charList([], { chatId: "chat-1", userId: ownerId, },)).systemMessage,).toContain("missing database",);
  });

  // ── /char-get ─────────────────────────────────────────────

  test("shows usage with no character id", async () => {
    expect((await charGet([], ctx(),)).systemMessage,).toBe("Usage: /char-get <char-id>",);
  });

  test("returns the card, its stats and its lore entries", async () => {
    await insertCharacterStats(db, charId, 30, 40, 15, { level: 4, speed: 30, str: 12, dex: 16, },);
    await insertActorLoreEntries(db, charId, "Iria guards the tide gate.", { name: "Tide gate", },);

    const result = await charGet([charId,], ctx(),);
    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("char-get",);
    expect(result.systemMessage,).toContain("**Character:** Iria",);
    expect(result.systemMessage,).toContain("Wry, watchful.",);
    expect(result.systemMessage,).toContain("Weathered leathers.",);
    expect(result.systemMessage,).toContain("Scout kit.",);
    expect(result.systemMessage,).toContain("At the ash gate.",);
    expect(result.systemMessage,).toContain("**Version:** 1.2",);
    expect(result.systemMessage,).toContain("level 4 · HP 30/40 · AC 15",);
    expect(result.systemMessage,).toContain("DEX 16",);
    expect(result.systemMessage,).toContain("Tide gate",);
    expect(result.actionPayload!.lore as unknown[],).toHaveLength(1,);

    // Same row, same command, caller who does not own it: refused, and no card
    // field appears. Keeps this happy path from being tautological about access.
    const denied = await charGet([charId,], ctx({ userId: otherId, },),);
    expect(denied.systemMessage,).toBe(`Character ${charId} not found or access denied.`,);
    expect(denied.systemMessage,).not.toContain("A weathered scout.",);
    expect(denied.action,).toBeUndefined();
  });

  test("renders the empty-state for a character with no stats or lore", async () => {
    const result = await charGet([charId,], ctx(),);
    expect(result.systemMessage,).toContain("**Stats:** _none_",);
    expect(result.systemMessage,).toContain("**Lore entries (0):**",);
  });

  test("denies a character the caller does not own", async () => {
    const theirs = await insertActors(db, "Theirs", {
      actor_type: ActorType.Character,
      owner_id: otherId,
      description: "Secret plans.",
    },);

    const result = await charGet([theirs,], ctx(),);
    expect(result.systemMessage,).toBe(`Character ${theirs} not found or access denied.`,);
    expect(result.systemMessage,).not.toContain("Secret plans.",);
    expect(result.action,).toBeUndefined();
  });

  test("a missing character is worded identically to a denied one", async () => {
    const theirs = await insertActors(db, "Theirs", { actor_type: ActorType.Character, owner_id: otherId, },);
    const missingId = `actor-${crypto.randomUUID()}`;

    const denied = await charGet([theirs,], ctx(),);
    const absent = await charGet([missingId,], ctx(),);

    expect(absent.systemMessage!.replace(missingId, "<id>",),).toBe(denied.systemMessage!.replace(theirs, "<id>",),);
  });

  test("refuses an actor id that is not a character", async () => {
    const narrator = await insertActors(db, "Voice", { actor_type: ActorType.Narrator, owner_id: ownerId, },);
    expect((await charGet([narrator,], ctx(),)).systemMessage,).toBe(
      `Character ${narrator} not found or access denied.`,
    );
  });

  test("reports missing context instead of throwing", async () => {
    expect((await charGet([charId,], { chatId: "chat-1", db, },)).systemMessage,).toContain(
      "command context has no user",
    );

    expect((await charGet([charId,], { chatId: "chat-1", userId: ownerId, },)).systemMessage,).toContain(
      "missing database",
    );
  });

  // ── /char-update ──────────────────────────────────────────

  test("shows usage with no character id", async () => {
    expect((await charUpdate([], ctx(),)).systemMessage,).toContain("Usage: /char-update <char-id>",);
  });

  test("previews allowed fields with the row's content version", async () => {
    const result = await charUpdate([
      charId,
      'displayName="Iria the Bold"',
      "avatarFocusX=12.5",
      "llmAssistEnabled=true",
    ], ctx(),);

    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("char-update",);
    expect(result.systemMessage,).toContain("Iria",);
    expect(result.systemMessage,).toContain("displayName",);

    const payload = result.actionPayload as Record<string, unknown>;
    expect(payload.charId,).toBe(charId,);
    expect(payload.name,).toBe("Iria",);
    expect(payload.updates,).toEqual({
      displayName: "Iria the Bold",
      avatarFocusX: 12.5,
      llmAssistEnabled: true,
    },);

    const row = await db.selectFrom("actors",).select("row_version",).where("id", "=", charId,).executeTakeFirst();
    expect(payload.contentVersion,).toBe(row!.row_version,);
  });

  test("denies another user's character", async () => {
    const theirs = await insertActors(db, "Theirs", { actor_type: ActorType.Character, owner_id: otherId, },);
    const result = await charUpdate([theirs, "displayName=Hijack",], ctx(),);
    expect(result.action,).toBeUndefined();
    expect(result.systemMessage,).toBe(`Character ${theirs} not found or access denied.`,);
  });

  test("a missing character is worded identically to a denied one", async () => {
    const missingId = `actor-${crypto.randomUUID()}`;
    const absent = await charUpdate([missingId, "displayName=Ghost",], ctx(),);
    const theirs = await insertActors(db, "Theirs", { actor_type: ActorType.Character, owner_id: otherId, },);
    const denied = await charUpdate([theirs, "displayName=Hijack",], ctx(),);

    expect(absent.systemMessage!.replace(missingId, "<id>",),).toBe(denied.systemMessage!.replace(theirs, "<id>",),);
  });

  test("refuses an actor id that is not a character", async () => {
    const narrator = await insertActors(db, "Voice", { actor_type: ActorType.Narrator, owner_id: ownerId, },);
    expect((await charUpdate([narrator, "displayName=Voice",], ctx(),)).systemMessage,).toBe(
      `Character ${narrator} not found or access denied.`,
    );
  });

  test("rejects unknown fields, bad numbers and bad booleans", async () => {
    const unknown = await charUpdate([charId, "hp=99",], ctx(),);
    expect(unknown.action,).toBeUndefined();
    expect(unknown.systemMessage,).toContain("Unknown character field",);
    expect(unknown.systemMessage,).toContain("hp",);

    const badNumber = await charUpdate([charId, "avatarFocusX=tall",], ctx(),);
    expect(badNumber.systemMessage,).toContain('expects a number, got "tall"',);

    const badBoolean = await charUpdate([charId, "llmAssistEnabled=maybe",], ctx(),);
    expect(badBoolean.systemMessage,).toContain('expects true or false, got "maybe"',);
  });

  test("reports missing context instead of throwing", async () => {
    // Without a user the ownership guard fails closed with the same denial as
    // any other unauthorized caller.
    expect((await charUpdate([charId, "displayName=X",], { chatId: "chat-1", db, },)).systemMessage,).toBe(
      `Character ${charId} not found or access denied.`,
    );

    expect((await charUpdate([charId, "displayName=X",], { chatId: "chat-1", userId: ownerId, },)).systemMessage,)
      .toContain(
        "missing database",
      );
  });

  test("parseCharacterUpdates: last-wins on repeated keys and ignores non-pairs", async () => {
    const parsed = parseCharacterUpdates('description="one" nonsense description="two"',);
    expect(parsed,).toEqual({ ok: true, updates: { description: "two", }, },);

    const empty = parseCharacterUpdates("no pairs here",);
    expect(empty,).toEqual({ ok: false, error: expect.stringContaining("No updates parsed",), },);
  });
});
