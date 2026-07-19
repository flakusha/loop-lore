/**
 * ComfyUI Provider — HTTP/WebSocket client for ComfyUI API.
 *
 * ComfyUI is a node-based workflow editor for diffusion models.
 * This client submits workflow JSON, polls (or watches via WebSocket)
 * for execution progress, and retrieves generated images.
 *
 * Reference: docs/spec/integrations/image-generation.md §ComfyUI
 */

import { validateProviderUrl, } from "../../utils/url-validation";

export type ComfyUIWorkflow = Record<
  string,
  {
    inputs: Record<string, unknown>;
    class_type: string;
    _meta?: { title?: string };
  }
>;

export interface ComfyUIPromptResult {
  prompt_id: string;
  number?: number;
  node_errors?: Record<string, { class_type: string; errors: unknown[] }>;
}

export interface ComfyUIExecutionStatus {
  prompt_id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  progress?: { value: number; max: number };
  outputs?: Record<string, { images?: { filename: string; subfolder?: string; type?: string }[] }>;
  error?: string;
}

export interface ComfyUINodeInfo {
  name: string;
  display_name: string;
  category: string;
  input: { required?: Record<string, unknown>; optional?: Record<string, unknown> };
  output: unknown[];
  output_name: string[];
}

export interface ComfyUIClientOptions {
  baseUrl: string;
  timeout?: number;
  pollIntervalMs?: number;
}

export class ComfyUIClient {
  readonly baseUrl: string;
  private timeout: number;
  private pollIntervalMs: number;

  constructor(options: ComfyUIClientOptions,) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "",);
    this.timeout = options.timeout ?? 120_000;
    this.pollIntervalMs = options.pollIntervalMs ?? 500;

    const validated = validateProviderUrl(this.baseUrl,);
    if (!validated.ok) {
      throw new Error(`Invalid ComfyUI URL: ${validated.error}`,);
    }
  }

  /**
   * Submit a workflow for execution.
   *
   * @param workflow - ComfyUI API-format workflow JSON
   * @returns prompt_id for tracking execution
   */
  async submitWorkflow(workflow: ComfyUIWorkflow,): Promise<ComfyUIPromptResult> {
    const url = `${this.baseUrl}/prompt`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({ prompt: workflow, },),
      signal: AbortSignal.timeout(this.timeout,),
    },);

    if (!resp.ok) {
      const body = await resp.text().catch(() => "unknown");
      throw new Error(`ComfyUI prompt submission failed [${resp.status}]: ${body}`,);
    }

    return (await resp.json()) as ComfyUIPromptResult;
  }

  /**
   * Poll for execution result by prompt_id.
   *
   * Returns null if not yet complete, throws on failure.
   */
  async pollResult(promptId: string,): Promise<{
    done: boolean;
    images?: { filename: string; subfolder?: string; type?: string }[];
    error?: string;
  }> {
    const url = `${this.baseUrl}/history/${promptId}`;

    const resp = await fetch(url, {
      signal: AbortSignal.timeout(10_000,),
    },);

    if (!resp.ok) {
      throw new Error(`ComfyUI history fetch failed [${resp.status}]`,);
    }

    const data = (await resp.json()) as Record<string, ComfyUIExecutionStatus>;
    const entry = data[promptId];

    if (!entry) {
      return { done: false, };
    }

    if (entry.status === "completed") {
      const images: { filename: string; subfolder?: string; type?: string }[] = [];
      if (entry.outputs) {
        for (const nodeOutput of Object.values(entry.outputs,)) {
          if (nodeOutput.images) {
            images.push(...nodeOutput.images,);
          }
        }
      }
      return { done: true, images, };
    }

    if (entry.status === "failed" || entry.status === "cancelled") {
      return { done: true, error: entry.error ?? `execution ${entry.status}`, };
    }

    return { done: false, };
  }

  /**
   * Wait for workflow completion with polling.
   *
   * @param promptId - the prompt_id from submitWorkflow
   * @param timeoutMs - max wait time in ms (overrides client timeout)
   * @returns list of generated image filenames
   */
  async waitForCompletion(promptId: string, timeoutMs?: number,): Promise<string[]> {
    const deadline = Date.now() + (timeoutMs ?? this.timeout);

    while (Date.now() < deadline) {
      const result = await this.pollResult(promptId,);

      if (result.done) {
        if (result.error) {
          throw new Error(`ComfyUI execution failed: ${result.error}`,);
        }
        return (result.images ?? []).map((img,) => img.filename);
      }

      await new Promise((r,) => setTimeout(r, this.pollIntervalMs,));
    }

    throw new Error("ComfyUI execution timed out",);
  }

  /**
   * Cancel a running execution.
   */
  async cancelExecution(_promptId?: string,): Promise<void> {
    const url = `${this.baseUrl}/interrupt`;
    await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(10_000,),
    },);
  }

  /**
   * Discover available nodes and their inputs.
   */
  async getNodeInfo(): Promise<Record<string, ComfyUINodeInfo>> {
    const url = `${this.baseUrl}/object_info`;
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(10_000,),
    },);

    if (!resp.ok) {
      throw new Error(`ComfyUI object_info failed [${resp.status}]`,);
    }

    return (await resp.json()) as Record<string, ComfyUINodeInfo>;
  }

  /**
   * Download a generated image by filename.
   *
   * @param filename - as returned from pollResult / waitForCompletion
   * @param subfolder - optional subfolder from ComfyUI output
   * @param type - output type ("output" default, "temp")
   */
  async downloadImage(
    filename: string,
    subfolder?: string,
    type: "output" | "temp" = "output",
  ): Promise<Buffer> {
    const params = new URLSearchParams({ filename, type, },);
    if (subfolder) { params.set("subfolder", subfolder,); }

    const url = `${this.baseUrl}/view?${params.toString()}`;
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(30_000,),
    },);

    if (!resp.ok) {
      throw new Error(`ComfyUI image download failed [${resp.status}]: ${filename}`,);
    }

    return Buffer.from(await resp.arrayBuffer(),);
  }

  /**
   * Run a workflow end-to-end: submit → wait → download images.
   *
   * @returns array of image buffers
   */
  async runWorkflow(workflow: ComfyUIWorkflow,): Promise<Buffer[]> {
    const { prompt_id, } = await this.submitWorkflow(workflow,);
    const filenames = await this.waitForCompletion(prompt_id,);

    const buffers: Buffer[] = [];
    for (const filename of filenames) {
      buffers.push(await this.downloadImage(filename,),);
    }
    return buffers;
  }
}
