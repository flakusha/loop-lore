// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Hot-path budget for `handleSceneTransitions` (issue e20f01c).
 *
 * Split/reunion detection here is detect-and-log and runs on every user
 * message, so it must stay regex-only: the message then pays exactly ONE AUX
 * roundtrip — the transition classifier's fallback — never two. The AUX split
 * fallback is opt-in on `classifySplitIntent` (`allowAux`), and the "control"
 * case below pins what the old wiring cost on the same input (two roundtrips),
 * which is what makes the `toBe(1)` assertion meaningful rather than incidental.
 *
 * The AUX role is pointed at a registered stub provider so the real `callAux`
 * policy runs and every roundtrip is counted; no `mock.module` (process-global).
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import { classifySplitIntent, } from "../../chat/split-classifier";
import { classifyTransitionMessage, } from "../../chat/transitions";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import type { DB, } from "../../db/schema";
import { registerProvider, unregisterProvider, } from "../../generation/providers/registry";
import type { GenerateRequest, GenerateResponse, LLMProvider, } from "../../generation/providers/types";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { handleSceneTransitions, } from "./handle-scene-transitions";

const STUB_PROVIDER = "stub-scene-transitions-aux";
const STUB_MODEL = "stub-scene-model";

/** A message that misses BOTH the transition and the split/reunite regexes. */
const REGEX_MISS_MESSAGE = "The rain keeps us indoors.";

/** Every aux request the stub provider saw. */
let calls: GenerateRequest[] = [];

registerProvider(
  STUB_PROVIDER,
  {
    capabilities: {
      type: "openai-compatible",
      label: "stub scene-transitions provider",
      text: true,
      image: false,
      embeddings: false,
      streaming: false,
      tools: false,
      thinking: false,
    },
    complete: async (req: GenerateRequest,): Promise<GenerateResponse> => {
      calls.push(req,);
      return {
        content: '{"isTransition": false}',
        finishReason: "stop",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, },
      };
    },
    stream: () => {
      throw new Error("streaming not supported by stub provider",);
    },
    healthCheck: () => Promise.resolve({ status: "ok", },),
    listModels: () => Promise.resolve([],),
  } satisfies LLMProvider,
);

// The provider registry is process-global: unregister so later suites see a pristine registry.
afterAll(() => {
  unregisterProvider(STUB_PROVIDER,);
},);

describe("scene transitions aux budget", () => {
  let db: Kysely<DB>;
  let sqlite: { close(): void };
  let chatId: string;
  let actorId: string;

  beforeEach(async () => {
    createLogger({ level: "error", },);
    const ctx = await createTestDb();
    db = ctx.db;
    sqlite = ctx.sqlite;
    calls = [];
    // Point the AUX role at the stub so every roundtrip is observable.
    await db
      .insertInto("model_role_overrides",)
      .values({ role: "auxiliary", provider: STUB_PROVIDER, model: STUB_MODEL, },)
      .execute();

    actorId = crypto.randomUUID();
    await insertUsers(db, "scene-user", "Scene User", { id: actorId, } as never,);
    await insertActors(db, "Scene User", { id: actorId, user_id: actorId, owner_id: actorId, } as never,);
    chatId = crypto.randomUUID();
    await insertChats(db, "Scene Chat", actorId, { id: chatId, } as never,);
  },);

  afterEach(() => {
    sqlite.close();
  },);

  it("spends exactly one aux roundtrip on a regex-miss message", async () => {
    const config = createConfigSchema().defaults as Config;

    await handleSceneTransitions(db, config, chatId, actorId, REGEX_MISS_MESSAGE, undefined,);

    // One roundtrip = the transition classifier's own fallback (callAux("transition"))
    // ... and NOT a second one from split classification.
    expect(calls,).toHaveLength(1,);
    expect(calls[0]?.model,).toBe(STUB_MODEL,);
  });

  it("does not add an aux roundtrip when the split regex hits", async () => {
    const config = createConfigSchema().defaults as Config;

    await handleSceneTransitions(db, config, chatId, actorId, "We split up at the crossroads.", undefined,);

    expect(calls.length,).toBeLessThanOrEqual(1,);
  });

  it("control: without the gate the same message costs two roundtrips", async () => {
    const config = createConfigSchema().defaults as Config;

    // The pre-fix wiring: the split classifier's aux call (opted in here) plus
    // the transition classifier's. Pins the delta the hot-path gate removes.
    await classifySplitIntent(REGEX_MISS_MESSAGE, config, db, { allowAux: true, userId: actorId, },);
    await classifyTransitionMessage(REGEX_MISS_MESSAGE, [], config, db, actorId,);

    expect(calls,).toHaveLength(2,);
  });
});
