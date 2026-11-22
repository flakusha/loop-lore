import { describe, expect, test, } from "bun:test";
import { formFromRow, parseGraphField, pretty, readJsonArrayField, requestBody, workflowFormState, } from "./form";
import { emptyWorkflowForm, } from "./types";
import type { WorkflowDetail, } from "./types";

/** A detail-endpoint row with a stored payload. */
function detailRow(over: Partial<NonNullable<WorkflowDetail>> = {},): NonNullable<WorkflowDetail> {
  return {
    id: "wf-1",
    name: "Basic",
    description: "A row",
    model_family: "sdxl",
    is_default: "not_default",
    enabled: "enabled",
    min_vram: 12,
    lora_slots: [],
    probe_status: "passing",
    license: "MIT",
    params_reviewed: 1,
    node_count: 1,
    category: "txt2img",
    missing_nodes: [],
    payload: {
      body: { "1": { class_type: "KSampler", }, },
      category: "img2img",
      parameters: [{ name: "steps", },],
      requiredNodes: ["KSampler", "VAEDecode",],
      loraSlots: [{ name: "lora1", },],
    },
    ...over,
  } as NonNullable<WorkflowDetail>;
}

describe("pretty", () => {
  test("pretty-prints objects", () => {
    expect(pretty({ a: 1, },),).toBe('{\n  "a": 1\n}',);
  });
});

describe("parseGraphField", () => {
  test("requires non-empty", () => {
    const errors: string[] = [];
    expect(parseGraphField("   ", errors,),).toBeNull();
    expect(errors,).toContain("Graph is required",);
  });

  test("accepts object", () => {
    const errors: string[] = [];
    expect(parseGraphField('{"a":1}', errors,),).toEqual({ a: 1, },);
  });
});

describe("readJsonArrayField", () => {
  test("blank returns undefined", () => {
    const errors: string[] = [];
    expect(readJsonArrayField("", "Parameters", errors,),).toBeUndefined();
  });

  test("returns array", () => {
    const errors: string[] = [];
    expect(readJsonArrayField("[1,2]", "Parameters", errors,),).toEqual([1, 2,],);
  });
});

describe("formFromRow", () => {
  test("projects a stored row onto the editor fields", () => {
    const form = formFromRow(detailRow(),);
    expect(form.id,).toBe("wf-1",);
    expect(form.name,).toBe("Basic",);
    expect(form.description,).toBe("A row",);
    expect(form.model_family,).toBe("sdxl",);
    expect(form.min_vram,).toBe("12",);
    expect(form.category,).toBe("img2img",);
    expect(form.license,).toBe("MIT",);
    expect(form.params_reviewed,).toBe(true,);
    expect(form.requiredNodes,).toBe("KSampler, VAEDecode",);
    expect(form.graph,).toBe(pretty({ "1": { class_type: "KSampler", }, },),);
    expect(form.parametersJson,).toBe(pretty([{ name: "steps", },],),);
    expect(form.loraSlotsJson,).toBe(pretty([{ name: "lora1", },],),);
  });

  test("fills defaults for a row with no payload", () => {
    const form = formFromRow(detailRow({
      payload: null,
      description: null,
      model_family: null,
      min_vram: null,
      license: null,
      params_reviewed: 0,
    },),);

    expect(form.description,).toBe("",);
    expect(form.model_family,).toBe("",);
    expect(form.min_vram,).toBe("",);
    expect(form.category,).toBe("txt2img",);
    expect(form.license,).toBe("",);
    expect(form.params_reviewed,).toBe(false,);
    expect(form.requiredNodes,).toBe("",);
    expect(form.graph,).toBe("",);
    expect(form.parametersJson,).toBe("",);
    expect(form.loraSlotsJson,).toBe("",);
  });

  test("omits empty parameter and slot lists", () => {
    const form = formFromRow(detailRow({
      payload: { body: {}, category: "txt2img", parameters: [], requiredNodes: [], },
    },),);

    expect(form.parametersJson,).toBe("",);
    expect(form.loraSlotsJson,).toBe("",);
  });
});

describe("requestBody", () => {
  test("trims fields and splits required nodes", () => {
    const body = requestBody({
      ...emptyWorkflowForm(),
      name: "  Basic  ",
      description: "  A row  ",
      model_family: "  sdxl  ",
      category: "img2img",
      requiredNodes: "KSampler, , VAEDecode ,",
      min_vram: "12",
      license: "  Apache-2.0  ",
      params_reviewed: true,
    }, { graph: { "1": {}, }, parameters: undefined, loraSlots: undefined, },);

    expect(body.name,).toBe("Basic",);
    expect(body.description,).toBe("A row",);
    expect(body.model_family,).toBe("sdxl",);
    expect(body.category,).toBe("img2img",);
    expect(body.requiredNodes,).toEqual(["KSampler", "VAEDecode",],);
    expect(body.body,).toEqual({ "1": {}, },);
    expect(body.min_vram,).toBe(12,);
    expect(body.license,).toBe("Apache-2.0",);
    expect(body.params_reviewed,).toBe(true,);
    expect(body,).not.toHaveProperty("parameters",);
    expect(body,).not.toHaveProperty("loraSlots",);
  });

  test("omits a blank or non-numeric min_vram", () => {
    const blank = requestBody({ ...emptyWorkflowForm(), min_vram: "  ", }, {
      graph: {},
      parameters: undefined,
      loraSlots: undefined,
    },);

    expect(blank,).not.toHaveProperty("min_vram",);
    const bad = requestBody({ ...emptyWorkflowForm(), min_vram: "abc", }, {
      graph: {},
      parameters: undefined,
      loraSlots: undefined,
    },);

    expect(bad,).not.toHaveProperty("min_vram",);
  });

  test("sends a blank license as null so an edit can clear the fence", () => {
    const body = requestBody({ ...emptyWorkflowForm(), license: "   ", }, {
      graph: {},
      parameters: undefined,
      loraSlots: undefined,
    },);

    expect(body.license,).toBeNull();
    expect(body.params_reviewed,).toBe(false,);
  });

  test("includes parameters and lora slots when set", () => {
    const body = requestBody(emptyWorkflowForm(), {
      graph: { a: 1, },
      parameters: [{ name: "steps", },],
      loraSlots: [{ name: "lora1", },],
    },);

    expect(body.parameters,).toEqual([{ name: "steps", },],);
    expect(body.loraSlots,).toEqual([{ name: "lora1", },],);
    expect(body.body,).toEqual({ a: 1, },);
  });
});

describe("loadWorkflowFile", () => {
  test("a picked UI-format export becomes the uploadedUiWorkflow request body", async () => {
    const graph = { nodes: [{ id: 1, type: "KSampler", },], links: [], };
    const file = new File([JSON.stringify(graph,),], "workflow.json", { type: "application/json", },);
    const state = {
      ...workflowFormState,
      workflowForm: emptyWorkflowForm(),
      workflowFormErrors: [] as string[],
    };

    await workflowFormState.loadWorkflowFile!.call(state, {
      target: { files: [file,], },
    } as unknown as Event,);

    expect(state.workflowFormErrors,).toEqual([],);
    expect(state.workflowForm.graph,).toBe(pretty(graph,),);

    const parsed = parseGraphField(state.workflowForm.graph, [],);
    expect(parsed,).not.toBeNull();
    const body = requestBody(state.workflowForm, {
      graph: parsed as object,
      parameters: undefined,
      loraSlots: undefined,
    },);

    // Backend `uploadedUiWorkflow` matches `body.nodes` with shaped nodes.
    expect(body.body,).toEqual(graph,);
    expect((body.body as { nodes: unknown[] }).nodes,).toEqual([{ id: 1, type: "KSampler", },],);
  });
});
