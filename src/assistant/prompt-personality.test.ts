// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for `withResolvedPersonality` — the wiring between the chat's stored
 * `gm_config.assistantPersonality` binding and the prompt params.
 *
 * Three contracts matter and all three are pinned:
 *   1. an explicit `params.assistantPersonality` is NEVER overwritten
 *      (the caller's voice wins over the stored one),
 *   2. a `server-default` / absent / malformed binding leaves params untouched,
 *      so existing chats keep byte-identical prompts,
 *   3. the whole lookup is best-effort — a DB failure degrades to the
 *      unchanged params instead of failing the whole prompt build.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, } from "../test-utils/insert-helpers";
import { PERSONALITY_CONFIG_KEY, } from "./personality/composer";
import { withResolvedPersonality, } from "./prompt-personality";
import type { AssembleChat, PromptParams, } from "./prompt/types";

function params(overrides?: Partial<PromptParams>,): PromptParams {
  return { actorId: "actor-1", chatId: "chat-1", modelId: "m", ...overrides, };
}

function chat(overrides?: Partial<AssembleChat>,): AssembleChat {
  return { id: "chat-1", mode: "story", world_id: null, current_location_id: null, ...overrides, };
}

/** Build the gm_config JSON blob holding a personality binding. */
function gmConfig(binding: unknown,): string {
  return JSON.stringify({ [PERSONALITY_CONFIG_KEY]: binding, },);
}

describe("withResolvedPersonality", () => {
  let db: Kysely<DB>;
  let actorId: string;

  beforeAll(async () => {
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  beforeEach(async () => {
    actorId = `actor-${crypto.randomUUID()}`;
    await insertActors(db, "The Archivist", {
      id: actorId,
      description: "Keeper of a flooded library.",
      personality: "Terse, archival.",
      scenario: "The reading room, after the flood.",
    },);
  },);

  test("injects the preset voice when gm_config carries a preset binding", async () => {
    const out = await withResolvedPersonality(
      db,
      params(),
      chat({ gm_config: gmConfig({ source: { kind: "preset", presetKey: "serious", }, },), },),
    );

    expect(out.assistantPersonality,).toContain("Serious",);
    expect(out.assistantPersonality,).toContain("<assistant_personality>",);
  });

  test("injects the character card when gm_config carries a character binding", async () => {
    const out = await withResolvedPersonality(
      db,
      params(),
      chat({ gm_config: gmConfig({ source: { kind: "character", actorId, }, },), },),
    );

    expect(out.assistantPersonality,).toContain("The Archivist",);
    expect(out.assistantPersonality,).toContain("Keeper of a flooded library.",);
  });

  test("never overwrites an explicitly supplied block", async () => {
    const out = await withResolvedPersonality(
      db,
      params({ assistantPersonality: "CALLER VOICE", },),
      chat({ gm_config: gmConfig({ source: { kind: "preset", presetKey: "fun", }, },), },),
    );

    expect(out.assistantPersonality,).toBe("CALLER VOICE",);
  });

  test("an explicit empty string is still respected (section stays off)", async () => {
    const out = await withResolvedPersonality(
      db,
      params({ assistantPersonality: "", },),
      chat({ gm_config: gmConfig({ source: { kind: "preset", presetKey: "fun", }, },), },),
    );

    expect(out.assistantPersonality,).toBe("",);
  });

  test("server-default leaves params untouched", async () => {
    const out = await withResolvedPersonality(
      db,
      params(),
      chat({ gm_config: gmConfig({ source: { kind: "server-default", }, },), },),
    );

    expect(out.assistantPersonality,).toBeUndefined();
  });

  test("a null gm_config leaves params untouched", async () => {
    expect((await withResolvedPersonality(db, params(), chat({ gm_config: null, },),)).assistantPersonality,)
      .toBeUndefined();

    expect((await withResolvedPersonality(db, params(), chat({},),)).assistantPersonality,).toBeUndefined();
  });

  test("malformed JSON and a malformed binding are both tolerated", async () => {
    const bad = await withResolvedPersonality(db, params(), chat({ gm_config: "{not json", },),);
    expect(bad.assistantPersonality,).toBeUndefined();

    const unknownPreset = await withResolvedPersonality(
      db,
      params(),
      chat({ gm_config: gmConfig({ source: { kind: "preset", presetKey: "nope", }, },), },),
    );

    expect(unknownPreset.assistantPersonality,).toBeUndefined();
  });

  test("a binding naming a missing character resolves to no block", async () => {
    const out = await withResolvedPersonality(
      db,
      params(),
      chat({ gm_config: gmConfig({ source: { kind: "character", actorId: "ghost-actor", }, },), },),
    );

    expect(out.assistantPersonality,).toBeUndefined();
  });

  test("a character card with no usable fields emits no block", async () => {
    const bareId = `actor-${crypto.randomUUID()}`;
    await insertActors(db, "", { id: bareId, description: null, personality: null, scenario: null, },);
    const out = await withResolvedPersonality(
      db,
      params(),
      chat({ gm_config: gmConfig({ source: { kind: "character", actorId: bareId, }, },), },),
    );

    expect(out.assistantPersonality,).toBeUndefined();
  });

  test("degrades to unchanged params when the database rejects the lookup", async () => {
    const broken = {
      selectFrom() {
        throw new Error("db is down",);
      },
      // `as unknown as Kysely<DB>`: the character lookup is the only DB call
      // reachable before the deliberate throw.
    } as unknown as Kysely<DB>;

    const out = await withResolvedPersonality(
      broken,
      params(),
      chat({ gm_config: gmConfig({ source: { kind: "character", actorId, }, },), },),
    );

    expect(out.assistantPersonality,).toBeUndefined();
    expect(out.actorId,).toBe("actor-1",);
  });

  test("returns the same object identity when nothing resolves (no needless copy)", async () => {
    const input = params();
    expect(await withResolvedPersonality(db, input, chat({ gm_config: null, },),),).toBe(input,);
  });
});
