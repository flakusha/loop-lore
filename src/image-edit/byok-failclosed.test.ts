// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Fail-closed ordering on the image-edit run path: the BYO credential is
 * resolved BEFORE the provider executes, so a corrupt stored row aborts the
 * run with {@link ByoKeyDecryptError} and the backend is never reached — the
 * operator credential can never be silently billed.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { loadConfig, } from "../config/load";
import type { Config, ImageProviderConfig, } from "../config/schema";
import type { DB, } from "../db/schema";
import { ByoKeyDecryptError, } from "../generation/providers/user-api-key";
import { createTestDb, destroyTestDb, } from "../test-utils/create-test-db";
import { insertUserApiKeys, insertUsers, } from "../test-utils/insert-helpers";
import { resolveEditApiKey, } from "./credentials";
import { ComfyUIEditProvider, } from "./providers/comfyui-provider";
import type {
  ImageEditExecuteOpts,
  ImageEditRequest,
  WorkflowTemplate,
} from "./types";

const SECRET = "edit-byok-encryption-key";
const USER_ID = "edit-failclosed-user";
const PROVIDER = "edit-failclosed-comfy";

function sdInstance(name: string,): ImageProviderConfig {
  return {
    name,
    label: name,
    baseUrl: `http://${name}.invalid`,
    apiFamily: "openai",
    defaults: { width: 64, height: 64, steps: 1, cfgScale: 1, sampler: "euler", },
    timeout: 1000,
    generationTimeout: 1000,
  };
}

function config(): Config {
  const cfg: Config = {
    ...loadConfig(),
    generation: {
      providers: {
        openaiCompatible: [],
        anthropic: undefined,
        ollamaNative: undefined,
        sd: [sdInstance(PROVIDER,),],
      },
      defaultProvider: "",
      defaultModels: {},
    },
  };

  cfg.byoKey = { enabled: true, encryptionKey: SECRET, } as Config["byoKey"];
  return cfg;
}

let testDb: Kysely<DB>;
let testSqlite: Database;

beforeAll(async () => {
  const env = await createTestDb();
  testDb = env.db;
  testSqlite = env.sqlite;
  await insertUsers(testDb, USER_ID, "Fail-closed User", { id: USER_ID, },);
  await insertUserApiKeys(testDb, USER_ID, PROVIDER, "corrupt-ciphertext-not-decryptable",);
},);

afterAll(async () => {
  await destroyTestDb({ db: testDb, sqlite: testSqlite, },);
},);

test("a corrupt BYO row aborts the edit run before the backend executes", async () => {
  let executed = false;

  // The exact run-path sequence from handleRun: resolve first, execute second.
  const run = async (): Promise<unknown> => {
    const apiKey = await resolveEditApiKey({ userId: USER_ID, config: config(), db: testDb, },);
    const provider = new class extends ComfyUIEditProvider {
      override async execute(
        _request: ImageEditRequest,
        _template: WorkflowTemplate,
        _opts: ImageEditExecuteOpts,
      ): Promise<never> {
        executed = true;
        throw new Error("backend must never be reached on a corrupt BYO row",);
      }
    }();

    const template = { name: "probe", } as WorkflowTemplate;
    const request: ImageEditRequest = {
      template_id: "probe",
      backend: "comfyui",
      params: {},
    };

    return provider.execute(request, template, { ownerId: USER_ID, apiKey, },);
  };

  await expect(run(),).rejects.toThrow(ByoKeyDecryptError,);
  expect(executed,).toBe(false,);
});
