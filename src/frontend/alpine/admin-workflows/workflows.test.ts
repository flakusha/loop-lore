// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { adminWorkflows, } from "./index";
import { emptyWorkflowForm, } from "./types";

import type { ApiFetchMock, } from "../../tests/test-types";

const globalState = globalThis as unknown as {
  apiFetch?: ApiFetchMock;
  showToast?: (type: string, message: string,) => void;
};
const originalFetch = globalState.apiFetch;
const originalToast = globalState.showToast;
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);
let toasts: { type: string; message: string }[] = [];

beforeEach(() => {
  calls = [];
  toasts = [];
  handler = async () => Response.json({},);
  globalState.apiFetch = (url, opts,) => {
    calls.push({ url, opts: opts ?? {}, },);
    return handler(url, opts,);
  };
  globalState.showToast = (type, message,) => {
    toasts.push({ type, message, },);
  };
},);

afterEach(() => {
  globalState.apiFetch = originalFetch;
  globalState.showToast = originalToast;
  adminWorkflows.workflows = [];
  adminWorkflows.workflowTotal = 0;
  adminWorkflows.comfyuiReachable = false;
  adminWorkflows.loadingWorkflows = false;
  adminWorkflows.workflowFilter = "";
  adminWorkflows.confirmDeleteWorkflow = "";
  adminWorkflows.showWorkflowForm = false;
  adminWorkflows.workflowForm = emptyWorkflowForm();
  adminWorkflows.workflowFormErrors = [];
  adminWorkflows.savingWorkflow = false;
},);

const row = {
  id: "wf1",
  name: "SDXL portrait",
  description: null,
  model_family: "sdxl",
  is_default: "not_default",
  enabled: "enabled",
  min_vram: 12,
  lora_slots: null,
  node_count: 2,
  category: "txt2img",
  missing_nodes: null,
};

describe("adminWorkflows.loadWorkflows", () => {
  test("stores the decoded list and reachability", async () => {
    handler = async () => Response.json({ workflows: [row,], total: 1, comfyui_reachable: true, },);
    await adminWorkflows.loadWorkflows();
    expect(calls[0]!.url,).toBe("/api/v1/admin/comfyui-workflows",);
    expect(adminWorkflows.workflows[0]!.name,).toBe("SDXL portrait",);
    expect(adminWorkflows.workflowTotal,).toBe(1,);
    expect(adminWorkflows.comfyuiReachable,).toBe(true,);
  });

  test("says so when the list shape drifts, instead of reading as empty", async () => {
    handler = async () => Response.json({ items: [], count: 0, },);
    await adminWorkflows.loadWorkflows();
    expect(adminWorkflows.workflows,).toEqual([],);
    expect(toasts.at(-1,)?.message,).toBe(
      "Unexpected workflow list shape — see the console for the mismatch",
    );
  });

  test("keeps the rows already on screen when the list request fails", async () => {
    adminWorkflows.workflows = [{ ...row, },];
    handler = async () => new Response("boom", { status: 500, },);
    await adminWorkflows.loadWorkflows();
    expect(adminWorkflows.workflows,).toHaveLength(1,);
    expect(adminWorkflows.loadingWorkflows,).toBe(false,);
  });

  test("sends the enabled filter the route understands", async () => {
    handler = async () => Response.json({ workflows: [], total: 0, comfyui_reachable: false, },);
    adminWorkflows.workflowFilter = "disabled";
    await adminWorkflows.loadWorkflows();
    expect(calls[0]!.url,).toBe("/api/v1/admin/comfyui-workflows?enabled=disabled",);
  });
});

describe("adminWorkflows row actions", () => {
  test("set-default posts to the flag endpoint and reloads", async () => {
    handler = async () => Response.json({ id: "wf1", is_default: "default", },);
    await adminWorkflows.setWorkflowDefault("wf1",);
    expect(calls[0]!.url,).toBe("/api/v1/admin/comfyui-workflows/wf1/default",);
    expect(calls[0]!.opts.method,).toBe("POST",);
    expect(calls[1]!.url,).toBe("/api/v1/admin/comfyui-workflows",);
  });

  test("toggle posts to the enabled endpoint", async () => {
    handler = async () => Response.json({ id: "wf1", enabled: "disabled", },);
    await adminWorkflows.toggleWorkflowEnabled("wf1",);
    expect(calls[0]!.url,).toBe("/api/v1/admin/comfyui-workflows/wf1/enabled",);
    expect(calls[0]!.opts.method,).toBe("POST",);
  });

  test("delete clears the pending confirm and reloads", async () => {
    handler = async () => new Response(null, { status: 204, },);
    adminWorkflows.confirmDeleteWorkflow = "wf1";
    await adminWorkflows.deleteWorkflow("wf1",);
    expect(calls[0]!.url,).toBe("/api/v1/admin/comfyui-workflows/wf1",);
    expect(calls[0]!.opts.method,).toBe("DELETE",);
    expect(adminWorkflows.confirmDeleteWorkflow,).toBe("",);
  });
});

describe("adminWorkflows.saveWorkflow", () => {
  const graph = JSON.stringify({
    "3": { class_type: "KSampler", inputs: {}, },
    "4": { class_type: "SaveImage", inputs: {}, },
  },);

  test("POSTs a pasted graph with the graph under the body wrapper key", async () => {
    handler = async () => Response.json({ id: "wf9", name: "New", }, { status: 201, },);
    adminWorkflows.showWorkflowForm = true;
    adminWorkflows.workflowForm = {
      ...emptyWorkflowForm(),
      name: "New",
      model_family: "sdxl",
      min_vram: "12",
      requiredNodes: "KSampler, SaveImage",
      graph,
    };
    await adminWorkflows.saveWorkflow();
    const sent = JSON.parse(String(calls[0]!.opts.body,),) as Record<string, unknown>;
    expect(calls[0]!.url,).toBe("/api/v1/admin/comfyui-workflows",);
    expect(calls[0]!.opts.method,).toBe("POST",);
    expect(sent.name,).toBe("New",);
    expect(sent.model_family,).toBe("sdxl",);
    expect(sent.min_vram,).toBe(12,);
    expect(sent.category,).toBe("txt2img",);
    expect(sent.requiredNodes,).toEqual(["KSampler", "SaveImage",],);
    expect(sent.body,).toEqual(JSON.parse(graph,),);
    // Blank optional fields are omitted so a later edit keeps what is stored.
    expect(Object.hasOwn(sent, "parameters",),).toBe(false,);
    expect(Object.hasOwn(sent, "loraSlots",),).toBe(false,);
    expect(adminWorkflows.showWorkflowForm,).toBe(false,);
  });

  test("PUTs an existing row to its own endpoint", async () => {
    handler = async () => Response.json({ id: "wf1", name: "Renamed", },);
    adminWorkflows.workflowForm = {
      ...emptyWorkflowForm(),
      id: "wf1",
      name: "Renamed",
      graph,
    };
    await adminWorkflows.saveWorkflow();
    expect(calls[0]!.url,).toBe("/api/v1/admin/comfyui-workflows/wf1",);
    expect(calls[0]!.opts.method,).toBe("PUT",);
  });

  test("surfaces every ingest message from a 400 instead of failing silently", async () => {
    handler = async () =>
      Response.json(
        { error: "node 4: dead node; parameters[0].name: no {{steps}} placeholder", code: "BAD_REQUEST", meta: {}, },
        { status: 400, },
      );
    adminWorkflows.showWorkflowForm = true;
    adminWorkflows.workflowForm = { ...emptyWorkflowForm(), name: "Broken", graph, };
    await adminWorkflows.saveWorkflow();
    expect(adminWorkflows.showWorkflowForm,).toBe(true,);
    expect(adminWorkflows.workflowFormErrors,).toEqual([
      "node 4: dead node",
      "parameters[0].name: no {{steps}} placeholder",
    ],);
    expect(calls.length,).toBe(1,);
  });

  test("rejects an object where the route would silently coerce it to an empty array", async () => {
    adminWorkflows.workflowForm = {
      ...emptyWorkflowForm(),
      name: "Object parameters",
      graph,
      parametersJson: '{"name":"steps"}',
    };
    await adminWorkflows.saveWorkflow();
    expect(calls.length,).toBe(0,);
    expect(adminWorkflows.workflowFormErrors,).toEqual(["Parameters must be a JSON array",],);
  });

  test("rejects a non-array LoRA slot block the route would drop entirely", async () => {
    adminWorkflows.workflowForm = {
      ...emptyWorkflowForm(),
      name: "Object slots",
      graph,
      loraSlotsJson: '{"nodeId":"10"}',
    };
    await adminWorkflows.saveWorkflow();
    expect(calls.length,).toBe(0,);
    expect(adminWorkflows.workflowFormErrors,).toEqual(["LoRA slots must be a JSON array",],);
  });

  test("rejects a graph that is an array rather than a node map", async () => {
    adminWorkflows.workflowForm = { ...emptyWorkflowForm(), name: "Array graph", graph: "[1,2]", };
    await adminWorkflows.saveWorkflow();
    expect(calls.length,).toBe(0,);
    expect(adminWorkflows.workflowFormErrors,).toEqual(["Graph must be a JSON object of node id to node",],);
  });

  test("reports a client-side JSON error without calling the server", async () => {
    adminWorkflows.workflowForm = { ...emptyWorkflowForm(), name: "Broken", graph: "{not json", };
    await adminWorkflows.saveWorkflow();
    expect(calls.length,).toBe(0,);
    expect(adminWorkflows.workflowFormErrors.length,).toBeGreaterThan(0,);
  });
});

describe("adminWorkflows.openWorkflowEdit", () => {
  test("fills the editor from the stored payload", async () => {
    handler = async () =>
      Response.json({
        ...row,
        payload: {
          body: { "3": { class_type: "KSampler", inputs: {}, }, },
          category: "img2img",
          parameters: [{ name: "steps", type: "number", label: "Steps", default: 20, },],
          requiredNodes: ["KSampler", "SaveImage",],
        },
      },);
    await adminWorkflows.openWorkflowEdit("wf1",);
    expect(calls[0]!.url,).toBe("/api/v1/admin/comfyui-workflows/wf1",);
    expect(adminWorkflows.showWorkflowForm,).toBe(true,);
    expect(adminWorkflows.workflowForm.category,).toBe("img2img",);
    expect(adminWorkflows.workflowForm.requiredNodes,).toBe("KSampler, SaveImage",);
    expect(adminWorkflows.workflowForm.min_vram,).toBe("12",);
    expect(JSON.parse(adminWorkflows.workflowForm.graph,),).toEqual({ "3": { class_type: "KSampler", inputs: {}, }, },);
    expect(JSON.parse(adminWorkflows.workflowForm.parametersJson,)[0].name,).toBe("steps",);
  });

  test("keeps the form open and shows the error when the row is gone", async () => {
    handler = async () =>
      Response.json({ error: "Workflow wf1 not found", code: "NOT_FOUND", meta: {}, }, { status: 404, },);
    await adminWorkflows.openWorkflowEdit("wf1",);
    expect(adminWorkflows.showWorkflowForm,).toBe(true,);
    expect(adminWorkflows.workflowFormErrors,).toEqual(["Workflow wf1 not found",],);
  });
});
