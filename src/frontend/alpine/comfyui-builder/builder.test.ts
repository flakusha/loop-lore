// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import "../comfyui-builder";
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
  comfyuiBuilderState.palette = {};
  comfyuiBuilderState.loadingPalette = false;
  comfyuiBuilderState.paletteError = "";
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

describe("list actions", () => {
  test("loadChains records a network failure", async () => {
    handler = async () => {
      throw new Error("offline",);
    };
    await comfyuiBuilderState.loadChains();
    expect(comfyuiBuilderState.chainsError,).toBe("Network error loading chains",);
    expect(comfyuiBuilderState.loadingChains,).toBe(false,);
  });

  test("loadTemplates swallows network failures", async () => {
    handler = async () => {
      throw new Error("offline",);
    };
    await expect(comfyuiBuilderState.loadTemplates(),).resolves.toBeUndefined();
    expect(comfyuiBuilderState.templates,).toEqual([],);
  });

  test("deleteChain clears the confirm, toasts, and reloads", async () => {
    comfyuiBuilderState.confirmDeleteChain = "chain-1";
    const deleted: string[] = [];
    handler = async (url, opts,) => {
      if (opts?.method === "DELETE") {
        deleted.push(url,);
        return Response.json({ ok: true, },);
      }
      return Response.json({ chains: [chainRow,], },);
    };
    await comfyuiBuilderState.deleteChain("chain-1",);
    expect(deleted,).toEqual(["/api/v1/comfyui-builder/chains/chain-1",],);
    expect(comfyuiBuilderState.confirmDeleteChain,).toBe("",);
    expect(toasts,).toEqual([{ type: "success", message: "Chain deleted", },],);
    expect(comfyuiBuilderState.chains,).toHaveLength(1,);
  });

  test("deleteChain reports server and network failures", async () => {
    comfyuiBuilderState.confirmDeleteChain = "chain-1";
    handler = async () => Response.json({ error: "nope", }, { status: 404, },);
    await comfyuiBuilderState.deleteChain("chain-1",);
    expect(comfyuiBuilderState.confirmDeleteChain,).toBe("chain-1",);
    expect(toasts.at(-1,)?.message,).toContain("Failed to delete",);

    handler = async () => {
      throw new Error("offline",);
    };
    await comfyuiBuilderState.deleteChain("chain-1",);
    expect(toasts.at(-1,)?.message,).toContain("Network error",);
  });
});

describe("loadPalette", () => {
  test("stores the palette on success", async () => {
    handler = async () =>
      Response.json(
        { data: { KSampler: { display_name: "KSampler", category: "sampling", }, }, },
      );
    await comfyuiBuilderState.loadPalette();
    expect(comfyuiBuilderState.palette["KSampler"]?.display_name,).toBe("KSampler",);
    expect(comfyuiBuilderState.paletteError,).toBe("",);
    expect(comfyuiBuilderState.loadingPalette,).toBe(false,);
  });

  test("maps non-ok and network failures to paletteError", async () => {
    handler = async () => Response.json({ error: "boom", }, { status: 500, },);
    await comfyuiBuilderState.loadPalette();
    expect(comfyuiBuilderState.paletteError,).toBe("Palette load failed",);

    handler = async () => {
      throw new Error("offline",);
    };
    await comfyuiBuilderState.loadPalette();
    expect(comfyuiBuilderState.paletteError,).toBe("Network error loading palette",);
    expect(comfyuiBuilderState.loadingPalette,).toBe(false,);
  });
});

describe("pollRun failure branches", () => {
  beforeEach(() => {
    comfyuiBuilderState.runState = {
      jobId: "job-9",
      status: "running",
      error: "",
      completedSteps: 0,
      totalSteps: 0,
    };
  },);

  test("a response without a job status fails the run", async () => {
    handler = async () => Response.json({},);
    await comfyuiBuilderState.pollRun();
    expect(comfyuiBuilderState.runState.status,).toBe("failed",);
    expect(comfyuiBuilderState.runState.error,).toBe("Run status unavailable",);
  });

  test("a non-ok poll reads as unavailable", async () => {
    handler = async () => Response.json({ error: "gone", }, { status: 404, },);
    await comfyuiBuilderState.pollRun();
    expect(comfyuiBuilderState.runState.error,).toBe("Run status unavailable",);
  });

  test("a network failure during polling fails the run", async () => {
    handler = async () => {
      throw new Error("offline",);
    };
    await comfyuiBuilderState.pollRun();
    expect(comfyuiBuilderState.runState.status,).toBe("failed",);
    expect(comfyuiBuilderState.runState.error,).toBe("Network error polling run",);
  });

  test("a network failure during start records an error", async () => {
    handler = async () => {
      throw new Error("offline",);
    };
    await comfyuiBuilderState.startRun("chain-1",);
    expect(comfyuiBuilderState.runState.status,).toBe("failed",);
    expect(comfyuiBuilderState.runState.error,).toBe("Network error starting run",);
  });

  test("polling continues while the job is live", async () => {
    let polls = 0;
    handler = async () => {
      polls += 1;
      const job = polls === 1
        ? { status: "running", completedSteps: 1, totalSteps: 2, }
        : { status: "completed", completedSteps: 2, totalSteps: 2, };
      return Response.json({ job, },);
    };
    await comfyuiBuilderState.pollRun();
    expect(polls,).toBe(2,);
    expect(comfyuiBuilderState.runState.status,).toBe("completed",);
    expect(comfyuiBuilderState.runState.completedSteps,).toBe(2,);
  });

  test("a superseded poll stops instead of stamping onto the newer run", async () => {
    comfyuiBuilderState.runState = {
      jobId: "job-A",
      status: "running",
      error: "",
      completedSteps: 0,
      totalSteps: 2,
    };
    let polls = 0;
    handler = async () => {
      polls += 1;
      // Mid-poll a newer run takes the store over — exactly what startRun does
      // when it replaces runState wholesale.
      comfyuiBuilderState.runState = {
        jobId: "job-B",
        status: "running",
        error: "",
        completedSteps: 0,
        totalSteps: 5,
      };
      return Response.json({ job: { status: "completed", completedSteps: 2, totalSteps: 2, }, },);
    };

    await comfyuiBuilderState.pollRun();

    // A's loop must abandon its job, not report completion against B.
    expect(polls,).toBe(1,);
    expect(comfyuiBuilderState.runState.jobId,).toBe("job-B",);
    expect(comfyuiBuilderState.runState.status,).toBe("running",);
    expect(comfyuiBuilderState.runState.completedSteps,).toBe(0,);
    expect(calls.map((call,) => call.url),).toEqual(["/api/v1/comfyui-builder/runs/job-A",],);
  });
});

describe("editor open/close and step fallbacks", () => {
  test("openCreate resets the editor", () => {
    comfyuiBuilderState.editName = "stale";
    comfyuiBuilderState.editingId = "old";
    comfyuiBuilderState.saveError = "boom";
    comfyuiBuilderState.openCreate();
    expect(comfyuiBuilderState.editName,).toBe("",);
    expect(comfyuiBuilderState.editingId,).toBe("",);
    expect(comfyuiBuilderState.saveError,).toBe("",);
    expect(comfyuiBuilderState.showEditor,).toBe(true,);
    expect(comfyuiBuilderState.savingChain,).toBe(false,);
  });

  test("openEdit copies a chain into the editor without aliasing steps", () => {
    comfyuiBuilderState.chains = [chainRow,];
    comfyuiBuilderState.openEdit("chain-1",);
    expect(comfyuiBuilderState.editingId,).toBe("chain-1",);
    expect(comfyuiBuilderState.editName,).toBe("Portrait chain",);
    expect(comfyuiBuilderState.editDescription,).toBe("",);
    expect(comfyuiBuilderState.steps,).toHaveLength(1,);
    expect(comfyuiBuilderState.showEditor,).toBe(true,);
    comfyuiBuilderState.steps[0]!.params.steps = 99;
    expect(comfyuiBuilderState.chains[0]!.steps[0]!.params.steps,).toBe(20,);
  });

  test("closeEditor hides the form", () => {
    comfyuiBuilderState.showEditor = true;
    comfyuiBuilderState.closeEditor();
    expect(comfyuiBuilderState.showEditor,).toBe(false,);
  });

  test("addStep handles null, missing, and non-primitive defaults", () => {
    comfyuiBuilderState.templates = [{
      id: "tpl-x",
      name: "Fallbacks",
      description: "",
      category: "txt2img",
      backends: ["comfyui",],
      parameters: [
        { name: "mask", type: "boolean", label: "Mask", default: null, },
        { name: "style", type: "string", label: "Style", default: undefined, },
        { name: "weird", type: "string", label: "Weird", default: { nested: 1, }, },
      ],
    },];
    comfyuiBuilderState.pickedTemplateId = "tpl-x";
    comfyuiBuilderState.addStep();
    expect(comfyuiBuilderState.steps,).toHaveLength(1,);
    expect(comfyuiBuilderState.steps[0]!.params,).toEqual(
      { mask: false, style: "", weird: "[object Object]", },
    );
  });

  test("setStepParam assigns primitives and stringifies the rest", () => {
    comfyuiBuilderState.templates = [template,];
    comfyuiBuilderState.pickedTemplateId = "tpl-1";
    comfyuiBuilderState.addStep();
    comfyuiBuilderState.setStepParam(0, "prompt", true,);
    expect(comfyuiBuilderState.steps[0]!.params.prompt,).toBe(true,);
    comfyuiBuilderState.setStepParam(0, "prompt", { deep: 1, },);
    expect(comfyuiBuilderState.steps[0]!.params.prompt,).toBe("[object Object]",);
    comfyuiBuilderState.setStepParam(0, "prompt", undefined,);
    expect(comfyuiBuilderState.steps[0]!.params.prompt,).toBe("",);
  });

  test("a network failure during save records an error", async () => {
    comfyuiBuilderState.editName = "Net";
    handler = async () => {
      throw new Error("offline",);
    };
    await comfyuiBuilderState.saveChain();
    expect(comfyuiBuilderState.saveError,).toBe("Network error saving chain",);
    expect(comfyuiBuilderState.savingChain,).toBe(false,);
  });
});

describe("comfyuiBuilder factory", () => {
  test("returns a fresh state object per call", () => {
    const factory = globalThis.comfyuiBuilder;
    expect(factory,).toBeDefined();
    const first = factory!();
    const second = factory!();
    expect(first,).not.toBe(second,);
    expect(first.chains,).toEqual([],);
  });
});
