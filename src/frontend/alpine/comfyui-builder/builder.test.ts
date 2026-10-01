// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { comfyuiBuilderState, } from "./index";
import { type BuilderTemplate, emptyEditor, } from "./types";

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
  comfyuiBuilderState.chains = [];
  comfyuiBuilderState.loadingChains = false;
  comfyuiBuilderState.chainsError = "";
  comfyuiBuilderState.templates = [];
  comfyuiBuilderState.confirmDeleteChain = "";
  Object.assign(comfyuiBuilderState, emptyEditor(),);
  comfyuiBuilderState.showEditor = false;
  comfyuiBuilderState.savingChain = false;
  comfyuiBuilderState.runState = {
    jobId: "",
    status: "",
    error: "",
    completedSteps: 0,
    totalSteps: 0,
  };
},);

const chainRow = {
  id: "chain-1",
  name: "Portrait chain",
  description: null,
  steps: [
    { id: "s1", templateId: "tpl-1", params: { steps: 20, }, },
  ],
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

const template: BuilderTemplate = {
  id: "tpl-1",
  name: "SDXL txt2img",
  description: "Base generation",
  category: "txt2img",
  backends: ["comfyui",],
  parameters: [
    { name: "steps", type: "number", label: "Steps", default: 20, },
    { name: "prompt", type: "string", label: "Prompt", default: "", },
    { name: "tiled", type: "boolean", label: "Tiled", default: false, },
  ],
};

describe("comfyuiBuilderState.loadChains / loadTemplates", () => {
  test("stores chains and templates from their endpoints", async () => {
    handler = async (url,) => {
      if (url.includes("/chains",)) { return Response.json({ chains: [chainRow,], },); }
      return Response.json({ data: [template,], },);
    };
    await comfyuiBuilderState.init();
    expect(comfyuiBuilderState.chains,).toHaveLength(1,);
    expect(comfyuiBuilderState.chains[0]!.name,).toBe("Portrait chain",);
    expect(comfyuiBuilderState.templates[0]!.id,).toBe("tpl-1",);
    expect(calls.map((call,) => call.url),).toEqual([
      "/api/v1/comfyui-builder/chains",
      "/api/v1/image-edit/templates?backend=comfyui",
    ],);
  });

  test("records a load failure instead of reading as empty", async () => {
    handler = async () => Response.json({ error: "boom", }, { status: 500, },);
    await comfyuiBuilderState.loadChains();
    expect(comfyuiBuilderState.chains,).toEqual([],);
    expect(comfyuiBuilderState.chainsError,).toContain("Failed",);
  });
});

describe("step editing", () => {
  beforeEach(() => {
    comfyuiBuilderState.templates = [template,];
    comfyuiBuilderState.pickedTemplateId = "tpl-1";
  },);

  test("addStep seeds params from the template defaults", () => {
    comfyuiBuilderState.addStep();
    expect(comfyuiBuilderState.steps,).toHaveLength(1,);
    expect(comfyuiBuilderState.steps[0]!.templateId,).toBe("tpl-1",);
    expect(comfyuiBuilderState.steps[0]!.params,).toEqual({ steps: 20, prompt: "", tiled: false, },);
  });

  test("addStep is a no-op without a picked template", () => {
    comfyuiBuilderState.pickedTemplateId = "";
    comfyuiBuilderState.addStep();
    comfyuiBuilderState.pickedTemplateId = "missing";
    comfyuiBuilderState.addStep();
    expect(comfyuiBuilderState.steps,).toEqual([],);
  });

  test("moveStep reorders within bounds only", () => {
    comfyuiBuilderState.addStep();
    comfyuiBuilderState.addStep();
    comfyuiBuilderState.steps[0]!.id = "a";
    comfyuiBuilderState.steps[1]!.id = "b";

    comfyuiBuilderState.moveStep(0, 1,);
    expect(comfyuiBuilderState.steps.map((step,) => step.id),).toEqual(["b", "a",],);

    // Out-of-bounds moves are no-ops, not rotations.
    comfyuiBuilderState.moveStep(1, 1,);
    comfyuiBuilderState.moveStep(0, -1,);
    expect(comfyuiBuilderState.steps.map((step,) => step.id),).toEqual(["b", "a",],);
  });

  test("removeStep deletes by index", () => {
    comfyuiBuilderState.addStep();
    comfyuiBuilderState.addStep();
    comfyuiBuilderState.removeStep(0,);
    expect(comfyuiBuilderState.steps,).toHaveLength(1,);
  });

  test("setStepParam coerces number params from input strings", () => {
    comfyuiBuilderState.addStep();
    comfyuiBuilderState.setStepParam(0, "steps", "42",);
    expect(comfyuiBuilderState.steps[0]!.params.steps,).toBe(42,);
    comfyuiBuilderState.setStepParam(0, "steps", "not-a-number",);
    expect(comfyuiBuilderState.steps[0]!.params.steps,).toBe(0,);
    comfyuiBuilderState.setStepParam(0, "prompt", "hello",);
    expect(comfyuiBuilderState.steps[0]!.params.prompt,).toBe("hello",);
    // Unknown index never throws.
    comfyuiBuilderState.setStepParam(9, "prompt", "x",);
  });
});

describe("saveChain", () => {
  test("POSTs a new chain and closes the editor on success", async () => {
    comfyuiBuilderState.editName = "  My chain  ";
    comfyuiBuilderState.editDescription = "desc";
    comfyuiBuilderState.steps = [{ id: "s1", templateId: "tpl-1", params: { steps: 20, }, },];
    handler = async (_url, opts,) => {
      if (opts?.method === "POST") { return Response.json({ chain: chainRow, }, { status: 201, },); }
      return Response.json({ chains: [chainRow,], },);
    };
    await comfyuiBuilderState.saveChain();

    expect(calls[0]!.url,).toBe("/api/v1/comfyui-builder/chains",);
    const body = JSON.parse(calls[0]!.opts.body as string,) as {
      name: string;
      description: string | null;
      steps: unknown[];
    };
    expect(body.name,).toBe("My chain",);
    expect(body.description,).toBe("desc",);
    expect(body.steps,).toHaveLength(1,);
    expect(comfyuiBuilderState.showEditor,).toBe(false,);
    expect(comfyuiBuilderState.savingChain,).toBe(false,);
  });

  test("PATCHes when editing an existing chain", async () => {
    comfyuiBuilderState.editingId = "chain-1";
    comfyuiBuilderState.editName = "Renamed";
    comfyuiBuilderState.steps = [];
    handler = async (_url, opts,) => {
      if (opts?.method === "PATCH") { return Response.json({ chain: chainRow, },); }
      return Response.json({ chains: [], },);
    };
    await comfyuiBuilderState.saveChain();
    expect(calls[0]!.url,).toBe("/api/v1/comfyui-builder/chains/chain-1",);
    expect(calls[0]!.opts.method,).toBe("PATCH",);
  });

  test("a blank name never sends a request", async () => {
    comfyuiBuilderState.editName = "   ";
    await comfyuiBuilderState.saveChain();
    expect(calls,).toHaveLength(0,);
    expect(comfyuiBuilderState.saveError,).toContain("Name is required",);
  });

  test("surfaces the server-side rejection message", async () => {
    comfyuiBuilderState.editName = "Bad";
    handler = async () =>
      Response.json(
        { error: "steps[0]: duplicate step id s1", },
        { status: 400, },
      );
    await comfyuiBuilderState.saveChain();
    expect(comfyuiBuilderState.saveError,).toContain("duplicate step id s1",);
    expect(comfyuiBuilderState.savingChain,).toBe(false,);
  });
});

describe("startRun / pollRun", () => {
  test("starts a run and polls it to a terminal state", async () => {
    handler = async (url, opts,) => {
      if (url.endsWith("/runs",) && opts?.method === "POST") {
        return Response.json({ jobId: "job-1", }, { status: 201, },);
      }
      return Response.json({
        job: {
          status: "completed",
          error: null,
          completedSteps: 2,
          totalSteps: 2,
        },
      },);
    };
    await comfyuiBuilderState.startRun("chain-1",);
    expect(comfyuiBuilderState.runState.jobId,).toBe("job-1",);
    expect(comfyuiBuilderState.runState.status,).toBe("completed",);
    expect(comfyuiBuilderState.runState.completedSteps,).toBe(2,);
    expect(calls.map((call,) => call.url),).toEqual([
      "/api/v1/comfyui-builder/runs",
      "/api/v1/comfyui-builder/runs/job-1",
    ],);
  });

  test("a rejected start records the server error", async () => {
    handler = async () => Response.json({ error: "Chain not found", }, { status: 404, },);
    await comfyuiBuilderState.startRun("missing",);
    expect(comfyuiBuilderState.runState.status,).toBe("failed",);
    expect(comfyuiBuilderState.runState.error,).toContain("Chain not found",);
    expect(calls,).toHaveLength(1,);
  });

  test("a failed job surfaces its error", async () => {
    handler = async (url, opts,) => {
      if (url.endsWith("/runs",) && opts?.method === "POST") {
        return Response.json({ jobId: "job-2", }, { status: 201, },);
      }
      return Response.json({
        job: { status: "failed", error: "Unknown template: nope", completedSteps: 0, totalSteps: 2, },
      },);
    };
    await comfyuiBuilderState.startRun("chain-1",);
    expect(comfyuiBuilderState.runState.status,).toBe("failed",);
    expect(comfyuiBuilderState.runState.error,).toContain("Unknown template",);
  });
});
