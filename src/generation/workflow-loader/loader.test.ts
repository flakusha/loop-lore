/**
 * Workflow Loader Tests
 *
 * Pins directory scan, validation skips, substitution, and errors.
 *
 * getWorkflowLoader is a process-global singleton (first workflowsDir wins),
 * so this file resets it in beforeAll (resetWorkflowLoaderForTests, mirroring
 * resetHealthCache) and uses its own fixture directory — otherwise
 * image-engine/convenience tests that bind it to configs/workflows (which
 * ships img2img) make the fixture assertions see a ghost workflow.
 */
import { afterAll, beforeAll, describe, expect, it, } from "bun:test";
import { mkdir, rm, writeFile, } from "node:fs/promises";
import { createLogger, } from "../../logger/index.js";
import { getWorkflowLoader, resetWorkflowLoaderForTests, } from "./loader.js";

const DIR = ".tmp/wf-fixtures-loader";
// Node "5" must be linked from, and node "6" is a terminal sink, or strict
// ingest rejects the fixture as a graph with a dead node.
const WORKFLOW = {
  "5": { class_type: "CLIPTextEncode", inputs: { text: "{{prompt}}", cfg: 1, }, },
  "6": { class_type: "SaveImage", inputs: { images: ["5", 0,], }, },
};

/** A graph whose node "5" is linked from nothing and is not a terminal sink. */
const WORKFLOW_WITH_DEAD_NODE = {
  "5": { class_type: "CLIPTextEncode", inputs: { text: "{{prompt}}", cfg: 1, }, },
};

async function fixtures(): Promise<void> {
  await mkdir(DIR, { recursive: true, },);
  await writeFile(`${DIR}/txt2img.json`, JSON.stringify(WORKFLOW,),);
  await writeFile(`${DIR}/broken.json`, "{not json",);
  await writeFile(`${DIR}/empty.json`, "{}",);
  await writeFile(`${DIR}/readme.txt`, "ignored",);
  await writeFile(`${DIR}/deadnode.json`, JSON.stringify(WORKFLOW_WITH_DEAD_NODE,),);
}

beforeAll(async () => {
  resetWorkflowLoaderForTests();
  await fixtures();
},);

afterAll(async () => {
  await rm(DIR, { recursive: true, force: true, },);
},);

function inputOf(workflow: unknown, nodeId: string,): Record<string, unknown> {
  if (!workflow || typeof workflow !== "object") { throw new Error("not a workflow object",); }
  const node = (workflow as Record<string, unknown>)[nodeId];
  if (!node || typeof node !== "object" || !("inputs" in node)) {
    throw new Error(`node ${nodeId} has no inputs`,);
  }
  const inputs: unknown = node.inputs;
  if (!inputs || typeof inputs !== "object") { throw new Error("inputs not an object",); }
  return inputs as Record<string, unknown>;
}

describe("getWorkflowLoader", () => {
  it("lists only valid workflows and substitutes vars", async () => {
    createLogger({ level: "error", },);
    await fixtures();
    const loader = getWorkflowLoader(DIR,);
    // deadnode.json is skipped: its CLIPTextEncode is unreferenced and is not a sink.
    expect(await loader.listWorkflows(),).toEqual(["txt2img",],);
    const loaded = await loader.loadWorkflow({ name: "txt2img", vars: { prompt: "cat", }, },);
    expect(inputOf(loaded, "5",).text,).toBe("cat",);
  });
  it("refuses to load a workflow with a dead node", async () => {
    await fixtures();
    const loader = getWorkflowLoader(DIR,);
    expect(await loader.listWorkflows(),).not.toContain("deadnode",);
    await expect(loader.loadWorkflow({ name: "deadnode", },),).rejects.toThrowError("not found",);
  });
  it("applies node overrides and returns raw workflows", async () => {
    await fixtures();
    const loader = getWorkflowLoader(DIR,);
    const loaded = await loader.loadWorkflow({
      name: "txt2img",
      nodeOverrides: new Map([["5", { cfg: 9, },],],),
    },);
    expect(inputOf(loaded, "5",).cfg,).toBe(9,);
    expect(await loader.getRawWorkflow("missing",),).toBeNull();
  });
  it("throws for unknown workflows", async () => {
    await fixtures();
    const loader = getWorkflowLoader(DIR,);
    await expect(loader.loadWorkflow({ name: "nope", },),).rejects.toThrowError("not found",);
  });
});
