// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the RAG remainder commands: /rag-preview, /rag-decompose.
 *
 * `callAux` is mocked behind the ISOLATED gate (bun's `mock.module` is
 * process-global — the repo's canonical gates run `--isolate`/`--parallel`,
 * and an unguarded stub would poison later files, BUG 9c8bea1). The
 * deterministic decomposer is pure and tested without any mock.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { AuxCallResult, } from "../../aux-pipeline/types";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertUsers,
  insertWorldLoreEntries,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import { deterministicDecompose, parseDecomposition, } from "./rag-decompose";
import type { CommandContext, CommandHandler, } from "./registry";
import { getCommand, } from "./registry";

// Side-effect import: the rag remainder handlers register themselves.
import "./rag-preview";

const callAuxMock = mock<
  (task: string, config: Config, db: Kysely<DB>, messages: unknown[], opts?: unknown,) => Promise<AuxCallResult | null>
>(() => Promise.resolve(null,));

if (ISOLATED) {
  mock.module("../../aux-pipeline", () => ({ callAux: callAuxMock, }),);
}

function mustGet(name: string,): CommandHandler {
  const handler = getCommand(name,);
  if (!handler) { throw new Error(`command not registered: ${name}`,); }
  return handler;
}

const ragPreview = mustGet("rag-preview",);
const ragDecompose = mustGet("rag-decompose",);

const NO_AUX_CONFIG = {
  generation: { defaultProvider: "mock", defaultModels: { mock: "m", }, modelRoles: {}, },
} as unknown as Config;

function auxResult(content: string,): AuxCallResult {
  return { content, model: "m", provider: "mock", latencyMs: 1, promptTokens: 1, completionTokens: 1, };
}

describe("deterministicDecompose", () => {
  test("splits sentences into topics and picks the first as summary", () => {
    const d = deterministicDecompose("The tide gate guards the city. Iria patrols nightly.",);
    expect(d.summary,).toBe("The tide gate guards the city.",);
    expect(d.topics,).toEqual(["The tide gate guards the city.", "Iria patrols nightly.",],);
  });

  test("ranks keywords by frequency and drops stopwords", () => {
    const d = deterministicDecompose("Dragons hoard gold. Dragons sleep on gold.",);
    expect(d.keywords[0],).toBe("dragons",);
    expect(d.keywords,).toContain("gold",);
    expect(d.keywords,).not.toContain("the",);
  });

  test("collects capitalized proper nouns as entities, deduplicated", () => {
    const d = deterministicDecompose("Iria met Iria at the gate.",);
    expect(d.entities,).toEqual(["Iria",],);
  });

  test("empty content yields empty decomposition", () => {
    const d = deterministicDecompose("",);
    expect(d.summary,).toBe("",);
    expect(d.topics,).toEqual([],);
    expect(d.keywords,).toEqual([],);
  });
});

describe("parseDecomposition", () => {
  test("parses a plain JSON payload", () => {
    const d = parseDecomposition('{"summary":"s","topics":["a"],"entities":[],"keywords":["k"]}',);
    expect(d?.summary,).toBe("s",);
    expect(d?.topics,).toEqual(["a",],);
  });

  test("parses a fenced payload and drops non-string list entries", () => {
    const d = parseDecomposition('```json\n{"summary":"s","topics":["a", 3],"entities":["E"]}\n```',);
    expect(d?.summary,).toBe("s",);
    expect(d?.topics,).toEqual(["a",],);
    expect(d?.entities,).toEqual(["E",],);
  });

  test("returns null without a string summary", () => {
    expect(parseDecomposition("not json",),).toBeNull();
    expect(parseDecomposition('{"topics":[]}',),).toBeNull();
  });
});

describeOrSkip("rag remainder commands", () => {
  describe("/rag-preview and /rag-decompose", () => {
    let db: Kysely<DB>;
    let ownerId: string;
    let otherId: string;
    let worldId: string;
    let loreId: string;

    const ownerCtx = (overrides?: Partial<CommandContext>,): CommandContext => ({
      chatId: "chat-1",
      db,
      config: NO_AUX_CONFIG,
      userId: ownerId,
      activeChat: { id: "chat-1", worldId, },
      ...overrides,
    });

    beforeAll(async () => {
      ({ db, } = await createTestDb());
    },);

    afterAll(async () => {
      await db.destroy();
    },);

    beforeEach(async () => {
      for (const table of ["world_lore_entries", "actors", "worlds", "users",] as const) {
        await db.deleteFrom(table,).execute();
      }

      callAuxMock.mockClear();
      callAuxMock.mockImplementation(() => Promise.resolve(null,));

      ownerId = `user-${crypto.randomUUID()}`;
      otherId = `user-${crypto.randomUUID()}`;
      await insertUsers(db, `owner-${ownerId}`, "Owner", { id: ownerId, },);
      await insertUsers(db, `other-${otherId}`, "Other", { id: otherId, },);

      worldId = `world-${crypto.randomUUID()}`;
      await insertWorlds(db, ownerId, "Lore World", { id: worldId, },);
      loreId = await insertWorldLoreEntries(db, worldId, "The drowned city lies beneath the tide. Iria guards it.", {
        name: "Drowned City",
      },);
    },);

    test("rag-preview renders the document for a world member of record", async () => {
      const res = await ragPreview([loreId,], ownerCtx(),);
      expect(res.handled,).toBe(true,);
      expect(res.systemMessage,).toContain("Drowned City",);
      expect(res.systemMessage,).toContain("The drowned city lies beneath the tide.",);
    });

    test("rag-preview denies a caller without world access", async () => {
      const res = await ragPreview([loreId,], ownerCtx({ userId: otherId, activeChat: { id: "chat-2", }, },),);
      expect(res.systemMessage,).toContain("not found or not accessible",);
    });

    test("rag-preview reports an unknown document id", async () => {
      const res = await ragPreview(["missing-doc",], ownerCtx(),);
      expect(res.systemMessage,).toContain("not found",);
    });

    test("rag-preview demands a doc id", async () => {
      const res = await ragPreview([], ownerCtx(),);
      expect(res.systemMessage,).toContain("Usage",);
    });

    test("rag-decompose falls back to the deterministic decomposer when aux is unavailable", async () => {
      const res = await ragDecompose([loreId,], ownerCtx(),);
      expect(res.handled,).toBe(true,);
      expect(res.systemMessage,).toContain("keyword fallback",);
      expect(res.systemMessage,).toContain("structRepr",);
      expect(res.systemMessage,).toContain("drowned",);
    });

    test("rag-decompose uses the aux payload when the model returns usable JSON", async () => {
      callAuxMock.mockImplementation(() =>
        Promise.resolve(auxResult(
          '{"summary":"A drowned city.","topics":["tide"],"entities":["Iria"],"keywords":["tide"]}',
        ),)
      );

      const res = await ragDecompose([loreId,], ownerCtx(),);
      expect(res.systemMessage,).toContain("aux model m",);
      expect(res.systemMessage,).toContain("A drowned city.",);
    });

    test("rag-decompose falls back when the model returns unusable output", async () => {
      callAuxMock.mockImplementation(() => Promise.resolve(auxResult("prose, not json",),));
      const res = await ragDecompose([loreId,], ownerCtx(),);
      expect(res.systemMessage,).toContain("keyword fallback",);
    });

    test("rag-decompose denies a caller without world access", async () => {
      const res = await ragDecompose([loreId,], ownerCtx({ userId: otherId, activeChat: { id: "chat-2", }, },),);
      expect(res.systemMessage,).toContain("not found or not accessible",);
    });
  });
},);
