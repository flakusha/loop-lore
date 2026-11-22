// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the derived workflow-library parameters.
 *
 * A library row that declares no parameters can never be built, so the
 * parameters are derived from the graph's own placeholders and the metadata
 * from the builtin template with the same id.
 */
import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, it, } from "bun:test";
import { Kysely, } from "kysely";
import { readFile, } from "node:fs/promises";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { jsonStringifyOr, } from "../../utils";
import type { ComfyUIWorkflow, } from "../providers/comfyui";
import type { WorkflowPayload, } from "../template-types";
import { deriveParameters, repairParameters, } from "./seed-parameters";
import { validateWorkflowPayload, } from "./validate";

let db: Kysely<DB>;
let sqlite: Database;

beforeAll(async () => {
  const made = await createTestDb();
  db = made.db;
  sqlite = made.sqlite;
  await insertUsers(db, "admin", "Admin", { id: "admin-1", role: "admin", },);
},);

afterAll(async () => {
  await db.destroy();
  sqlite.close();
},);

/** A graph with one `{{placeholder}}` in a node input, linked into a sink. */
function graphWith(placeholder: string,): ComfyUIWorkflow {
  return {
    "1": { class_type: "LoadImage", inputs: { image: `{{${placeholder}}}`, }, },
    "2": { class_type: "SaveImage", inputs: { images: ["1", 0,], }, },
  } as ComfyUIWorkflow;
}

/** A stored row payload with the given body and parameters. */
function payloadText(body: ComfyUIWorkflow, parameters: WorkflowPayload["parameters"],): string {
  return jsonStringifyOr({ body, category: "img2img", parameters, requiredNodes: [], } satisfies WorkflowPayload,);
}

/** Insert a library row with the given stored payload. */
async function insertRow(id: string, payload: string,): Promise<void> {
  await db
    .insertInto("prompt_templates",)
    .values({
      id,
      owner_id: "admin-1",
      modality: "workflow",
      name: id,
      description: null,
      model_family: null,
      payload,
    },)
    .execute();
}

/** The stored payload of a library row. */
async function storedPayload(id: string,): Promise<WorkflowPayload> {
  const row = await db.selectFrom("prompt_templates",).select("payload",).where("id", "=", id,)
    .executeTakeFirstOrThrow();

  return JSON.parse(row.payload,) as WorkflowPayload;
}

describe("deriveParameters", () => {
  it("takes the metadata from the builtin template with the same id", () => {
    const parameters = deriveParameters("img2img", graphWith("input_image",),);

    expect(parameters.length,).toBe(1,);
    expect(parameters[0]?.name,).toBe("input_image",);
    expect(parameters[0]?.type,).toBe("image",);
    expect(parameters[0]?.label,).toBe("Input Image",);
  });

  it("falls back to a plain string parameter for a placeholder the builtin does not declare", () => {
    const parameters = deriveParameters("img2img", graphWith("custom_knob",),);

    expect(parameters,).toEqual([{ name: "custom_knob", type: "string", label: "custom_knob", default: "", },],);
  });

  it("declares nothing for a body without placeholders", () => {
    const parameters = deriveParameters(
      "img2img",
      { "1": { class_type: "KSampler", inputs: {}, }, } as ComfyUIWorkflow,
    );

    expect(parameters,).toEqual([],);
  });
});

describe("repairParameters", () => {
  it("derives and writes back the parameters a broken row is missing", async () => {
    const broken = payloadText(graphWith("input_image",), [],);
    await insertRow("img2img", broken,);

    const repaired = await repairParameters(db, { payload: broken, }, "img2img",);

    expect(repaired,).toBe(true,);
    const stored = await storedPayload("img2img",);
    expect(stored.parameters.map((parameter,) => parameter.name),).toEqual(["input_image",],);
    expect(stored.parameters[0]?.type,).toBe("image",);
  });

  it("leaves a row that declares its own parameters alone", async () => {
    const edited = payloadText(graphWith("input_image",), [
      { name: "input_image", type: "image", label: "Mine", default: "", required: true, },
    ],);

    await insertRow("edited-row", edited,);

    const repaired = await repairParameters(db, { payload: edited, }, "edited-row",);

    expect(repaired,).toBe(false,);
    expect((await storedPayload("edited-row",)).parameters[0]?.label,).toBe("Mine",);
  });

  it("leaves a row whose body has no placeholders alone", async () => {
    const plain = payloadText({ "1": { class_type: "KSampler", inputs: {}, }, } as ComfyUIWorkflow, [],);
    await insertRow("plain-row", plain,);

    const repaired = await repairParameters(db, { payload: plain, }, "plain-row",);

    expect(repaired,).toBe(false,);
    expect((await storedPayload("plain-row",)).parameters,).toEqual([],);
  });

  it("repairs a probe-ingested converted row with globally-live converter nodes", async () => {
    const body = {
      ...graphWith("input_image",),
      "9": { class_type: "DaSiWa_NodeStatusSwitch", inputs: { enabled: true, }, },
    } as ComfyUIWorkflow;

    const broken = payloadText(body, [],);
    await insertRow("converted-row", broken,);

    // DaSiWa_NodeStatusSwitch is in UNREFERENCED_LIVE_CLASSES, which the
    // sink registry treats as globally live — no converter report needed.
    const repaired = await repairParameters(db, { payload: broken, }, "converted-row",);

    expect(repaired,).toBe(true,);
    expect((await storedPayload("converted-row",)).parameters.map((parameter,) => parameter.name),)
      .toEqual(["input_image",],);
  });
});

/** Graphs whose ModelAttentionBackend input used to hardcode a literal. */
const ATTENTION_GRAPHS = [
  "anima-v1",
  "krea2-v1",
  "minimax-h3-video-fl2va-opt-v1",
  "minimax-h3-video-fl2va-v1",
  "minimax-h3-video-ref2va-opt-v1",
  "minimax-h3-video-ref2va-v1",
  "moss-v1",
  "qwen-image-2-1-image-edit-v1",
  "qwen-image-2-1-t2i-v1",
] as const;

/** Already dead on the base branch; the seed skips it before validation. */
const PREEXISTING_DEAD_GRAPH = "qwen-image-2-1-image-edit-v1";

/** Read one shipped API-format graph; the test runner cwd is the repo root. */
async function shippedGraph(id: string,): Promise<ComfyUIWorkflow> {
  return JSON.parse(await readFile(`./configs/workflows/${id}.json`, "utf8",),) as ComfyUIWorkflow;
}

describe("shipped graphs with a bindable attention input", () => {
  it("holds exactly {{attention}} at every ModelAttentionBackend input", async () => {
    for (const id of ATTENTION_GRAPHS) {
      const graph = await shippedGraph(id,);
      const nodes = Object.values(graph,).filter((node,) => node.class_type === "ModelAttentionBackend");
      expect(nodes.length, `${id} attention node`,).toBe(1,);
      expect(nodes[0]?.inputs?.attention, `${id} attention input`,).toBe("{{attention}}",);
    }
  });

  it("derives an attention parameter from every touched graph", async () => {
    for (const id of ATTENTION_GRAPHS) {
      const graph = await shippedGraph(id,);
      expect(deriveParameters(id, graph,).map((parameter,) => parameter.name), `${id}`,).toContain("attention",);
    }
  });

  it("keeps the shipped attention literal as the derived default", async () => {
    for (const id of ATTENTION_GRAPHS) {
      const graph = await shippedGraph(id,);
      const attention = deriveParameters(id, graph,).find((parameter,) => parameter.name === "attention");

      expect(attention?.default, `${id}`,).toBe("comfy kitchen attention",);
    }
  });

  it("passes seed validation with the newly declared placeholder", async () => {
    for (const id of ATTENTION_GRAPHS) {
      const graph = await shippedGraph(id,);
      const result = validateWorkflowPayload({
        body: graph,
        category: "txt2img",
        parameters: deriveParameters(id, graph,),
        requiredNodes: [],
      },);

      if (id === PREEXISTING_DEAD_GRAPH) {
        expect(result.ok,).toBe(false,);
        if (!result.ok) {
          expect(result.errors.join(" ",),).not.toContain("attention",);
        }

        continue;
      }

      expect(result.ok, `${id}: ${result.ok ? "" : result.errors.join("; ",)}`,).toBe(true,);
    }
  });
});
