// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Classifier-backed turn selection tests.
 *
 * parseTurnSelection is pure — covered exhaustively. resolveTurnClassifierPick
 * runs against a real migrated DB + registered mock provider so the
 * `intent`-task aux call resolves end-to-end; the mock scripts replies per
 * exact user message, so verdicts are deterministic.
 */
import { beforeAll, describe, expect, it, } from "bun:test";
import type { Config, } from "../config/schema";
import { ModelRole, } from "../db/enums";
import { registerProvider, unregisterProvider, } from "../generation/providers/registry";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertModelRoleOverrides, } from "../test-utils/insert-helpers";
import { MockLLMProvider, } from "../test-utils/mock-provider";
import {
  type ClassifierCandidate,
  parseTurnSelection,
  resolveTurnClassifierPick,
} from "./classifier-selection";

beforeAll(() => {
  createLogger({ level: "error", },);
},);

const CANDIDATES: ClassifierCandidate[] = [
  { actorId: "a1", displayName: "Alpha", },
  { actorId: "a2", displayName: "Beta", },
];

describe("parseTurnSelection", () => {
  it("accepts a bare JSON verdict", () => {
    expect(parseTurnSelection('{"actorId":"a1","beatType":"action"}', CANDIDATES,),)
      .toEqual({ actorId: "a1", beatType: "action", },);
  });

  it("tolerates prose and markdown fences around the JSON", () => {
    const raw = 'Sure! ```json\n{"actorId":"a2","beatType":"dialogue"}\n```';
    expect(parseTurnSelection(raw, CANDIDATES,),).toEqual({ actorId: "a2", beatType: "dialogue", },);
  });

  it("discards an unknown actorId", () => {
    expect(parseTurnSelection('{"actorId":"zz","beatType":"action"}', CANDIDATES,),).toBeNull();
  });

  it("discards an unknown beatType", () => {
    expect(parseTurnSelection('{"actorId":"a1","beatType":"song"}', CANDIDATES,),).toBeNull();
  });

  it("discards non-JSON output", () => {
    expect(parseTurnSelection("Alpha should act next", CANDIDATES,),).toBeNull();
  });
});

const PROVIDER = "turn-classifier-test-provider";
const MODEL = "turn-classifier-test-model";

function stubConfig(): Config {
  return {
    generation: {
      defaultProvider: PROVIDER,
      defaultModels: { [PROVIDER]: MODEL, },
      modelRoles: {},
    },
    templates: { llm: { systemPrompts: {}, }, },
  } as unknown as Config;
}

/** Deterministic user-message text resolveTurnClassifierPick builds. */
function userTextFor(): string {
  return "Candidates:\n- a1: Alpha\n- a2: Beta\n\nLatest message:\nHello there";
}

describe("resolveTurnClassifierPick", () => {
  it("returns null immediately for an empty participant set", async () => {
    const { db, } = await createTestDb();
    const pick = await resolveTurnClassifierPick({
      config: stubConfig(),
      db,
      chatId: "chat-x",
      participants: [],
    },);

    expect(pick,).toBeNull();
    await db.destroy();
  });

  it("honors a valid classifier verdict end-to-end", async () => {
    const { db, } = await createTestDb();
    const mock = new MockLLMProvider();
    mock.setInputReply("intent", userTextFor(), '{"actorId":"a2","beatType":"narration"}',);
    unregisterProvider(PROVIDER,);
    registerProvider(PROVIDER, mock,);
    await insertModelRoleOverrides(db, PROVIDER, MODEL, { role: ModelRole.Auxiliary, } as never,);
    await insertModelRoleOverrides(db, PROVIDER, MODEL, { role: ModelRole.Classifier, } as never,);
    try {
      const pick = await resolveTurnClassifierPick({
        config: stubConfig(),
        db,
        chatId: "chat-x",
        userMessage: "Hello there",
        participants: CANDIDATES,
      },);

      expect(pick,).toEqual({ actorId: "a2", beatType: "narration", },);
    } finally {
      unregisterProvider(PROVIDER,);
      await db.destroy();
    }
  });

  it("degrades to null when the verdict is garbage (fail-open)", async () => {
    const { db, } = await createTestDb();
    const mock = new MockLLMProvider();
    mock.setInputReply("intent", userTextFor(), "Beta, obviously.",);
    unregisterProvider(PROVIDER,);
    registerProvider(PROVIDER, mock,);
    await insertModelRoleOverrides(db, PROVIDER, MODEL, { role: ModelRole.Auxiliary, } as never,);
    await insertModelRoleOverrides(db, PROVIDER, MODEL, { role: ModelRole.Classifier, } as never,);
    try {
      const pick = await resolveTurnClassifierPick({
        config: stubConfig(),
        db,
        chatId: "chat-x",
        userMessage: "Hello there",
        participants: CANDIDATES,
      },);

      expect(pick,).toBeNull();
    } finally {
      unregisterProvider(PROVIDER,);
      await db.destroy();
    }
  });
});
