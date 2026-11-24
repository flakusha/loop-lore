// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E: ComfyUI through the live llama-swap proxy.
 *
 * Presence (health + comfyui_auto roster) is always attempted and skips cleanly
 * when the proxy is down. The render leg is opt-in: E2E_LOCAL_LIVE=1 plus
 * E2E_COMFYUI_WORKFLOW, an API-format workflow JSON path or a name under
 * configs/workflows. Workflows are still in development, so none is hardcoded.
 */
import { describe, expect, test, } from "bun:test";
import {
  ComfyUIClient,
  type ComfyUIWorkflow,
} from "../../../src/generation/providers/comfyui";
import { getWorkflowLoader, } from "../../../src/generation/workflow-loader";
import { buildSubstitutionVars, } from "../../../src/generation/workflow-substitutor";

const BASE = process.env.LLAMA_SWAP_BASE_URL ?? "http://127.0.0.1:7180";
const COMFY_BASE = `${BASE}/upstream/comfyui_auto`;
const WORKFLOW = process.env.E2E_COMFYUI_WORKFLOW ?? "";
const LIVE = process.env.E2E_LOCAL_LIVE === "1";

/** @param path - proxy path
 * @returns the response, or null when the proxy is unreachable
 */
async function probe(path: string,): Promise<Response | null> {
  try {
    return await fetch(`${BASE}${path}`, {
      signal: AbortSignal.timeout(3_000,),
    },);
  } catch {
    return null;
  }
}

/** @returns whether the proxy answers /health */
async function reachable(): Promise<boolean> {
  const health = await probe("/health",);
  return health?.ok === true;
}

/** Resolve the operator-supplied workflow without pinning a development name.
 * Live mode throws on a loader failure so a named workflow cannot pass in
 * milliseconds without submitting; presence-only mode still skips quietly.
 * @returns the workflow, or null when absent/unreadable in presence-only mode
 */
async function loadWorkflow(): Promise<ComfyUIWorkflow | null> {
  if (!WORKFLOW) { return null; }
  if (WORKFLOW.endsWith(".json",)) {
    const file = Bun.file(WORKFLOW,);
    if (!(await file.exists())) { return null; }
    return await file.json() as ComfyUIWorkflow;
  }

  const vars = buildSubstitutionVars({ prompt: "A small red cube on a studio table", },);
  if (!LIVE) {
    try {
      return await getWorkflowLoader().loadWorkflow({ name: WORKFLOW, vars, },);
    } catch {
      return null;
    }
  }

  return await getWorkflowLoader().loadWorkflow({ name: WORKFLOW, vars, },);
}

describe("local ComfyUI via llama-swap", () => {
  test("presence: proxy is healthy and advertises comfyui_auto", async () => {
    const health = await probe("/health",);
    if (!health) { return; }
    expect(health.ok,).toBe(true,);

    const models = await probe("/v1/models",);
    expect(models?.ok,).toBe(true,);
    const roster = models ? await models.json() as { data?: Array<{ id?: string }> } : null;
    const ids = (roster?.data ?? []).map((model,) => model.id);
    expect(ids,).toContain("comfyui_auto",);
  });

  test("live: submit an operator-supplied workflow and collect outputs", async () => {
    if (!LIVE || !WORKFLOW) { return; }
    if (!(await reachable())) { return; }
    const workflow = await loadWorkflow();
    if (!workflow) { return; }

    const client = new ComfyUIClient({
      baseUrl: COMFY_BASE,
      timeout: 600_000,
      pollIntervalMs: 2_000,
    },);

    let promptId: string;
    try {
      promptId = (await client.submitWorkflow(workflow,)).prompt_id;
    } catch (error) {
      // No matching checkpoint/model installed yet: skip, do not fail.
      if (/not found|missing|no such file/i.test((error as Error).message,)) { return; }
      throw error;
    }

    const files = await client.waitForCompletion(promptId, 540_000,);
    expect(files.length,).toBeGreaterThan(0,);
  }, 600_000,);
});
