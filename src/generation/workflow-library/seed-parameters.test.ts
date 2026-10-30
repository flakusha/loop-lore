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
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { jsonStringifyOr, } from "../../utils";
import type { ComfyUIWorkflow, } from "../providers/comfyui";
import type { WorkflowPayload, } from "../template-types";
import { deriveParameters, repairParameters, } from "./seed-parameters";

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

  it("repairs a probe-ingested converted row in converted mode", async () => {
    const body = {
      ...graphWith("input_image",),
      "9": { class_type: "DaSiWa_NodeStatusSwitch", inputs: { enabled: true, }, },
    } as ComfyUIWorkflow;

    const broken = payloadText(body, [],);
    await insertRow("converted-row", broken,);

    expect(await repairParameters(db, { payload: broken, }, "converted-row",),).toBe(false,);

    const repaired = await repairParameters(
      db,
      { payload: broken, },
      "converted-row",
      { unreferencedLive: ["9",], },
    );

    expect(repaired,).toBe(true,);
    expect((await storedPayload("converted-row",)).parameters.map((parameter,) => parameter.name),)
      .toEqual(["input_image",],);
  });
});
