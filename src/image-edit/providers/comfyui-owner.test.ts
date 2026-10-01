// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression test for asset ownership on the ComfyUI edit write path.
 *
 * The provider used to hardcode `ownerId: "system"`, which is absent from
 * `users`: every run died on the FK and persisted nothing. Pinning the bug to
 * a bare FK check would have made the one-line `ensureSystemUser` fix look
 * complete, while actually collapsing every user's identical output onto one
 * row. These tests pin the behaviour that matters instead:
 *
 *   1. assets land under the authenticated owner (no FK crash), and
 *   2. two different owners running the *same* workflow with the *same* bytes
 *      get two distinct asset rows — the cross-tenant collapse.
 *
 * Both run against the real `createAsset`, so a regression anywhere on the
 * write path fails here.
 */
import { afterAll, beforeAll, describe, expect, mock, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { mkdtempSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { makeMinimalPng, } from "../../assets/test-helpers";
import * as realConfigLoad from "../../config/load";
import { setTestDatabase, } from "../../db";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { handleRun, } from "../routes";
import { templateRegistry, } from "../template-registry";
import type { ImageEditRequest, WorkflowTemplate, } from "../types";
import { ComfyUIEditProvider, } from "./comfyui-provider";

const IMAGE = makeMinimalPng(4, 4,);

// Captured before `mock.module` swaps the registry entry: reaching through
// `realConfigLoad` afterwards re-enters the mock and blows the stack.
const realLoadConfig = realConfigLoad.loadConfig;

/** Every run downloads this one filename, so both users collide on bytes. */
const FILENAME = "shared_output.png";

/** Stands in for the ComfyUI HTTP client: no sockets, deterministic bytes. */
class StubComfyUIClient {
  async submitWorkflow(): Promise<{ prompt_id: string }> {
    return { prompt_id: "stub-prompt", };
  }
  async waitForCompletion(): Promise<string[]> {
    return [FILENAME,];
  }
  async downloadImage(): Promise<Buffer> {
    return Buffer.from(IMAGE,);
  }
  async getNodeInfo(): Promise<Record<string, unknown>> {
    return {};
  }
}

const template: WorkflowTemplate = {
  id: "owner-probe",
  name: "Owner Probe",
  description: "stub",
  category: "txt2img",
  backends: ["comfyui",],
  required_nodes: [],
  parameters: [],
  build: () => ({}),
};

let db: Kysely<DB>;
let uploadDir = "";
const alice = uid();
const bob = uid();

const request: ImageEditRequest = { template_id: "owner-probe", backend: "comfyui", params: {}, };

beforeAll(async () => {
  mock.module("../../generation/providers/comfyui", () => ({ ComfyUIClient: StubComfyUIClient, }),);
  uploadDir = mkdtempSync(join(tmpdir(), "loop-lore-edit-owner-",),);
  mock.module("../../config/load", () => ({
    ...realConfigLoad,
    loadConfig: () => ({
      ...realLoadConfig(),
      assets: { uploadDir, },
      generation: { providers: { sd: [], }, },
    }),
  }),);

  templateRegistry.register(template,);
  const testDb = await createTestDb();
  db = testDb.db;
  setTestDatabase(db,);
  await insertUsers(db, `user-${alice}`, "Alice", { id: alice, } as never,);
  await insertUsers(db, `user-${bob}`, "Bob", { id: bob, } as never,);
},);

afterAll(async () => {
  mock.module("../../config/load", () => realConfigLoad,);
  setTestDatabase(null,);
  await db.destroy();
},);

describe("ComfyUI edit asset ownership", () => {
  test("persists the run under the authenticated owner, not a system row", async () => {
    const provider = new ComfyUIEditProvider();
    const results = await provider.execute(request, template, { ownerId: alice, },);

    expect(results.length,).toBe(1,);
    const row = await db
      .selectFrom("assets",)
      .select(["owner_id", "filename",],)
      .where("id", "=", results[0]!.id,)
      .executeTakeFirstOrThrow();

    expect(row.owner_id,).toBe(alice,);
  });

  test("two owners running identical bytes get distinct asset rows", async () => {
    const provider = new ComfyUIEditProvider();
    const a = await provider.execute(request, template, { ownerId: alice, },);
    const b = await provider.execute(request, template, { ownerId: bob, },);

    expect(a[0]!.id,).not.toBe(b[0]!.id,);

    const rows = await db
      .selectFrom("assets",)
      .select(["id", "owner_id",],)
      .where("filename", "=", FILENAME,)
      .execute();

    expect(rows.length,).toBe(2,);
    expect(rows.map((r,) => r.owner_id).sort(),).toEqual([alice, bob,].sort(),);
  });

  test("the run route threads the authenticated user through as the asset owner", async () => {
    // The provider-level tests above pass `ownerId` by hand, so they cannot
    // catch a route that forwards the wrong user (or `""`). This drives the
    // real handler end to end and reads the owner back off the persisted row.
    const res = await handleRun(
      new Request("http://localhost/api/v1/image-edit/run", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ template_id: "owner-probe", backend: "comfyui", params: {}, },),
      },),
      { database: db, userId: bob, userRole: "user", },
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: { id: string }[] };
    const row = await db
      .selectFrom("assets",)
      .select("owner_id",)
      .where("id", "=", body.data[0]!.id,)
      .executeTakeFirstOrThrow();
    expect(row.owner_id,).toBe(bob,);
  });
});
