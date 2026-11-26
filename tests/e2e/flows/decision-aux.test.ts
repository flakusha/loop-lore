// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E: decision aux path live over an OpenRouter :free chat model.
 *
 * Proves the existing decision path (judgeToolCall → callAux
 * "injection-check" classifier) runs live end to end: a BYO OpenRouter key
 * is stored for an openrouter-compatible provider, model_role_overrides rows
 * for the Classifier (preferred by injection-check) plus Auxiliary (fallback)
 * roles point at the env decision model, and the judge returns a shaped
 * verdict without throwing.
 *
 * Default model verified against the live catalog 2026-11-18
 * (GET https://openrouter.ai/api/v1/models, jq for pricing.prompt == 0 and
 * pricing.completion == 0): google/gemma-4-26b-a4b-it:free exists and is
 * free. Override with E2E_DECISION_MODEL (must be a live catalog id).
 *
 * Creds-gated: runs only with BYOK_E2E_API_KEY set (shared OpenRouter key);
 * skips cleanly without it. Leave BYOK_E2E_SKIP=1 to force-skip.
 * Creds template: `.credentials.env.example` (never commit `.credentials.env`).
 */
import { setModelRoleOverride, } from "@/admin/model-roles";
import { judgeToolCall, } from "@/assistant/guard/judge";
import { ModelRole, } from "@/db/enums";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type ApiClient, createClient, } from "../helpers/client";
import { SEED, seedAll, } from "../helpers/seed";
import { createTestServer, type TestServer, } from "../helpers/server";

const MASTER = "e2e-decision-master-secret-32bytes!";
const PROVIDER = "decision-aux-e2e";

const LIVE_BASE_URL = process.env.BYOK_E2E_BASE_URL ?? "https://openrouter.ai/api/v1";
const LIVE_HOST = new URL(LIVE_BASE_URL,).hostname;
const LIVE_KEY = process.env.BYOK_E2E_API_KEY ?? "";
const LIVE_MODEL = process.env.E2E_DECISION_MODEL ?? "google/gemma-4-26b-a4b-it:free";
const LIVE = LIVE_KEY !== "" && process.env.BYOK_E2E_SKIP !== "1";
const describeLive = LIVE ? describe : describe.skip;

describe("Decision aux path live over OpenRouter :free", () => {
  let server: TestServer | undefined;
  let api: ApiClient | undefined;

  beforeAll(async () => {
    if (!LIVE) { return; }
    server = await createTestServer({
      auth: { required: true, },
      byoKey: { enabled: true, encryptionKey: MASTER, },
      generation: {
        defaultProvider: PROVIDER,
        defaultModels: { [PROVIDER]: LIVE_MODEL, },
        providers: {
          openaiCompatible: [{
            name: PROVIDER,
            label: "Decision Aux E2E",
            baseUrl: LIVE_BASE_URL,
            allowedHosts: [LIVE_HOST,],
            model: LIVE_MODEL,
            timeout: 30_000,
            retries: 0,
            allowUserApiKey: true,
            models: {},
          },],
        },
      },
    },);

    await seedAll(server.db,);
    await setModelRoleOverride(ModelRole.Classifier, PROVIDER, LIVE_MODEL, server.db,);
    await setModelRoleOverride(ModelRole.Auxiliary, PROVIDER, LIVE_MODEL, server.db,);
    api = createClient(server.url,);
    expect(await api.loginAs(SEED.user.username, SEED.user.password,),).toBe(true,);
  },);

  afterAll(async () => {
    if (server) { await server.close(); }
  },);

  describeLive("live injection-check classifier over the env decision model", () => {
    test("benign wrapper judges without throwing and returns a shaped verdict", async () => {
      if (!server || !api) { throw new Error("live setup did not run",); }
      const store = await api.post("/api/v1/user-api-keys", {
        name: PROVIDER,
        provider: PROVIDER,
        api_key: LIVE_KEY,
      },);

      expect(store.status,).toBe(200,);

      try {
        const verdict = await judgeToolCall({
          tool: "dice-roll",
          args: ["2d6",],
          content: "Please roll 2d6 for my attack.",
          role: "player",
          config: server.config,
          db: server.db,
          userId: SEED.user.id,
          chatId: SEED.chat.id,
        },);

        expect(typeof verdict.approved,).toBe("boolean",);
        expect(typeof verdict.confidence,).toBe("number",);
        expect(verdict.confidence,).toBeGreaterThanOrEqual(0,);
        expect(verdict.confidence,).toBeLessThanOrEqual(1,);
        expect(typeof verdict.rationale,).toBe("string",);
        expect(verdict.rationale.length,).toBeGreaterThan(0,);
      } finally {
        await api.del(`/api/v1/user-api-keys/${PROVIDER}`,);
      }
    });
  },);
});
