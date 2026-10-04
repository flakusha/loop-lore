// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route contract tests for the ComfyUI builder surface: auth default-deny,
 * owner-scoped chain CRUD, validation errors, the async run lifecycle
 * (stubbed step runner), and palette error mapping.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { StepRunner, } from "../../generation/builder";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { comfyuiBuilderRoutes, } from "./index";
import { handlePalette, } from "./palette";

const CHAIN_BODY = {
  name: "Portrait chain",
  description: "txt2img then upscale",
  steps: [
    { id: "s1", templateId: "txt2img", params: { steps: 20, }, },
    { id: "s2", templateId: "upscale", params: { factor: 2, }, },
  ],
};

function makeApp(
  db: Kysely<DB>,
  userId: string | null,
  executeStep?: StepRunner,
): Elysia {
  return new Elysia({ name: "test-comfyui-builder", },)
    .derive({ as: "scoped", }, () => ({ userId, userRole: "user", }),)
    .use(comfyuiBuilderRoutes({ database: db, executeStep, },),) as unknown as Elysia;
}

function post(url: string, body: unknown,): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: JSON.stringify(body,),
  },);
}

/** Poll the run endpoint until it reports a terminal status. */
async function pollUntilDone(
  app: Elysia,
  jobId: string,
  timeoutMs = 2_000,
): Promise<{ status?: string; error?: string | null }> {
  const deadline = Date.now() + timeoutMs;
  let body: { job?: { status?: string; error?: string | null } } = {};
  while (Date.now() < deadline) {
    const res = await app.handle(new Request(`http://localhost/api/comfyui-builder/runs/${jobId}`,),);
    expect(res.status,).toBe(200,);
    body = await res.json() as typeof body;
    const status = body.job?.status;
    if (status === "completed" || status === "failed") { break; }
    await new Promise((resolve,) => setTimeout(resolve, 5,));
  }

  return body.job ?? {};
}

describe("comfyuiBuilderRoutes", () => {
  let db: Kysely<DB>;
  const ownerId = uid();
  const otherId = uid();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await insertUsers(db, `user-${ownerId}`, "Owner", { id: ownerId, } as never,);
    await insertUsers(db, `user-${otherId}`, "Other", { id: otherId, } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("401 for every endpoint without a session (default deny)", async () => {
    const app = makeApp(db, null,);
    const requests = [
      new Request("http://localhost/api/comfyui-builder/chains",),
      post("http://localhost/api/comfyui-builder/chains", CHAIN_BODY,),
      post("http://localhost/api/comfyui-builder/runs", { chainId: "x", },),
      post("http://localhost/api/comfyui-builder/validate", { workflow: {}, },),
      new Request("http://localhost/api/comfyui-builder/palette",),
    ];
    for (const request of requests) {
      const res = await app.handle(request,);
      expect(res.status,).toBe(401,);
    }
  });

  test("chain CRUD round-trips, owner-scoped", async () => {
    const app = makeApp(db, ownerId,);
    const created = await app.handle(post("http://localhost/api/comfyui-builder/chains", CHAIN_BODY,),);
    expect(created.status,).toBe(201,);
    const chain = ((await created.json()) as { chain: { id: string; steps: unknown[] } }).chain;
    expect(chain.steps,).toHaveLength(2,);

    const list = await app.handle(new Request("http://localhost/api/comfyui-builder/chains",),);
    expect(list.status,).toBe(200,);
    const listBody = (await list.json()) as { chains: { id: string }[] };
    expect(listBody.chains.some((entry,) => entry.id === chain.id),).toBe(true,);

    const got = await app.handle(
      new Request(`http://localhost/api/comfyui-builder/chains/${chain.id}`,),
    );
    expect(got.status,).toBe(200,);

    const patched = await app.handle(
      new Request(
        `http://localhost/api/comfyui-builder/chains/${chain.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ name: "Renamed", },),
        },
      ),
    );
    expect(patched.status,).toBe(200,);
    expect(((await patched.json()) as { chain: { name: string } }).chain.name,).toBe("Renamed",);

    const deleted = await app.handle(
      new Request(`http://localhost/api/comfyui-builder/chains/${chain.id}`, { method: "DELETE", },),
    );
    expect(deleted.status,).toBe(204,);
    const gone = await app.handle(
      new Request(`http://localhost/api/comfyui-builder/chains/${chain.id}`,),
    );
    expect(gone.status,).toBe(404,);
  });

  test("foreign chains read as 404 on get, patch, and delete", async () => {
    const ownerApp = makeApp(db, ownerId,);
    const created = await ownerApp.handle(
      post("http://localhost/api/comfyui-builder/chains", CHAIN_BODY,),
    );
    const chain = ((await created.json()) as { chain: { id: string } }).chain;

    const intruder = makeApp(db, otherId,);
    const got = await intruder.handle(
      new Request(`http://localhost/api/comfyui-builder/chains/${chain.id}`,),
    );
    expect(got.status,).toBe(404,);
    const patched = await intruder.handle(
      new Request(
        `http://localhost/api/comfyui-builder/chains/${chain.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ name: "Hijacked", },),
        },
      ),
    );
    expect(patched.status,).toBe(404,);
    const deleted = await intruder.handle(
      new Request(`http://localhost/api/comfyui-builder/chains/${chain.id}`, { method: "DELETE", },),
    );
    expect(deleted.status,).toBe(404,);

    // Owner's row is untouched.
    const stillThere = await ownerApp.handle(
      new Request(`http://localhost/api/comfyui-builder/chains/${chain.id}`,),
    );
    expect(stillThere.status,).toBe(200,);
    expect(
      ((await stillThere.json()) as { chain: { name: string } }).chain.name,
    ).toBe("Portrait chain",);
  });

  test("schema violations are 422", async () => {
    const app = makeApp(db, ownerId,);
    const noName = await app.handle(post("http://localhost/api/comfyui-builder/chains", { steps: [], },),);
    expect(noName.status,).toBe(422,);
    const badParam = await app.handle(post("http://localhost/api/comfyui-builder/chains", {
      name: "Bad",
      steps: [{ id: "s1", templateId: "t", params: { deep: { nested: true, }, }, },],
    },),);
    expect(badParam.status,).toBe(422,);
  });

  test("chain-level validation errors are 400 with the server message", async () => {
    const app = makeApp(db, ownerId,);
    const res = await app.handle(post("http://localhost/api/comfyui-builder/chains", {
      name: "Dupes",
      steps: [
        { id: "s1", templateId: "t", params: {}, },
        { id: "s1", templateId: "t", params: {}, },
      ],
    },),);
    expect(res.status,).toBe(400,);
    const body = (await res.json()) as { error?: string };
    expect(body.error,).toContain("duplicate step id s1",);
  });

  test("run: 404 unknown chain, 400 empty chain", async () => {
    const app = makeApp(db, ownerId, async () => Response.json({ data: [], },),);
    const unknown = await app.handle(post("http://localhost/api/comfyui-builder/runs", {
      chainId: "missing",
    },),);
    expect(unknown.status,).toBe(404,);

    const created = await app.handle(post("http://localhost/api/comfyui-builder/chains", {
      name: "Empty",
      steps: [],
    },),);
    const chain = ((await created.json()) as { chain: { id: string } }).chain;
    const empty = await app.handle(post("http://localhost/api/comfyui-builder/runs", {
      chainId: chain.id,
    },),);
    expect(empty.status,).toBe(400,);
  });

  test("run lifecycle: 201 → poll to completed with step results", async () => {
    const executed: string[] = [];
    const app = makeApp(db, ownerId, async (body,) => {
      executed.push(body.template_id,);
      return Response.json({ data: [{ filename: "out.png", },], },);
    },);

    const created = await app.handle(post("http://localhost/api/comfyui-builder/chains", CHAIN_BODY,),);
    const chain = ((await created.json()) as { chain: { id: string } }).chain;

    const started = await app.handle(post("http://localhost/api/comfyui-builder/runs", {
      chainId: chain.id,
    },),);
    expect(started.status,).toBe(201,);
    const { jobId, } = (await started.json()) as { jobId: string };
    expect(jobId.length,).toBeGreaterThan(0,);

    const final = await pollUntilDone(app, jobId,);
    expect(final.status,).toBe("completed",);
    expect(executed,).toEqual(["txt2img", "upscale",],);

    // Foreign pollers cannot read the job (IDOR guard).
    const intruder = makeApp(db, otherId,);
    const stolen = await intruder.handle(
      new Request(`http://localhost/api/comfyui-builder/runs/${jobId}`,),
    );
    expect(stolen.status,).toBe(404,);
  });

  test("run surfaces a failing step as a failed job", async () => {
    const app = makeApp(db, ownerId, async () =>
      Response.json(
        { error: "Unknown template: nope", },
        { status: 404, },
      ),);
    const created = await app.handle(post("http://localhost/api/comfyui-builder/chains", CHAIN_BODY,),);
    const chain = ((await created.json()) as { chain: { id: string } }).chain;
    const started = await app.handle(post("http://localhost/api/comfyui-builder/runs", {
      chainId: chain.id,
    },),);
    const { jobId, } = (await started.json()) as { jobId: string };

    const final = await pollUntilDone(app, jobId,);
    expect(final.status,).toBe("failed",);
    expect(final.error,).toContain("Unknown template: nope",);
  });

  test("validate endpoint reports cycles statically", async () => {
    const app = makeApp(db, ownerId,);
    const cycle = await app.handle(post("http://localhost/api/comfyui-builder/validate", {
      workflow: {
        a: { class_type: "KSampler", inputs: { model: ["b", 0,], }, },
        b: { class_type: "KSampler", inputs: { model: ["a", 0,], }, },
      },
    },),);
    expect(cycle.status,).toBe(200,);
    const cycleBody = (await cycle.json()) as { ok: boolean; issues: { kind: string }[] };
    expect(cycleBody.ok,).toBe(false,);
    expect(cycleBody.issues.map((issue,) => issue.kind),).toContain("cycle",);

    const valid = await app.handle(post("http://localhost/api/comfyui-builder/validate", {
      workflow: {
        "1": { class_type: "CheckpointLoaderSimple", inputs: {}, },
        "2": { class_type: "KSampler", inputs: { model: ["1", 0,], }, },
        "3": { class_type: "SaveImage", inputs: { images: ["2", 0,], }, },
      },
    },),);
    expect(valid.status,).toBe(200,);
    expect(((await valid.json()) as { ok: boolean }).ok,).toBe(true,);
  });

  test("validate endpoint rejects a workflow over the node cap", async () => {
    const app = makeApp(db, ownerId,);
    function nodes(count: number, classType: string,): Record<string, unknown> {
      const out: Record<string, unknown> = {};
      for (let i = 0; i < count; i++) {
        out["n" + i] = { class_type: classType, inputs: {}, };
      }
      return out;
    }

    // 101 nodes in the record form - one past the 100-node ceiling that
    // matches ChainCreateBody's `steps: maxItems: 100`.
    const tooManyNodes = await app.handle(
      post("http://localhost/api/comfyui-builder/validate", { workflow: nodes(101, "KSampler",), },),
    );
    expect(tooManyNodes.status,).toBe(422,);

    // The node-array form is bounded by the same ceiling.
    const shortArray = await app.handle(
      post("http://localhost/api/comfyui-builder/validate", { workflow: [1, 2, 3,], },),
    );
    expect(shortArray.status,).toBe(200,);
    const longArray = await app.handle(
      post("http://localhost/api/comfyui-builder/validate", {
        workflow: Array.from({ length: 101, }, (_, i,) => i,),
      },),
    );
    expect(longArray.status,).toBe(422,);

    // Exactly at the cap still validates - the bound does not clip real work.
    const atCap = await app.handle(
      post("http://localhost/api/comfyui-builder/validate", { workflow: nodes(100, "Note",), },),
    );
    expect(atCap.status,).toBe(200,);
  });

  test("palette handler maps upstream failures to 502 and timeouts to 504", async () => {
    const ok = await handlePalette({
      getNodeInfo: async () => ({ KSampler: { display_name: "KSampler", }, } as never),
    },);
    expect(ok.status,).toBe(200,);
    expect(((await ok.json()) as { data: Record<string, unknown> }).data.KSampler,).toBeDefined();

    const failed = await handlePalette({
      getNodeInfo: async () => {
        throw new Error("ComfyUI object_info failed [500]",);
      },
    },);
    expect(failed.status,).toBe(502,);

    const timeout = await handlePalette({
      getNodeInfo: async () => {
        const error = new Error("The operation timed out",);
        error.name = "TimeoutError";
        throw error;
      },
    },);
    expect(timeout.status,).toBe(504,);
  });
});
