// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 340

/**
 * ComfyUI Provider — HTTP/WebSocket client for ComfyUI API. Submits
 * workflow JSON, polls for execution, and retrieves generated images.
 * Reference: docs/spec/integrations/image-generation.md §ComfyUI
 */

import { jsonStringifyOr, } from "../../utils";
import { safeFromUint8Array, } from "../../utils/safe-buffer";
import { validateProviderUrl, } from "../../utils/url-validation";
import { uploadImageToComfy, } from "./comfyui-upload";

/** */
export type ComfyUIWorkflow = Record<
  string,
  {
    inputs: Record<string, unknown>;
    class_type: string;
    _meta?: { title?: string };
  }
>;

/** */
export interface ComfyUIPromptResult {
  prompt_id: string;
  number?: number;
  node_errors?: Record<string, { class_type: string; errors: unknown[] }>;
}

/** */
export interface ComfyUIExecutionStatus {
  prompt_id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  progress?: { value: number; max: number };
  outputs?: Record<string, ComfyUINodeOutput>;
  error?: string;
}

/** One output file entry emitted by a ComfyUI save node. */
export interface ComfyUIOutputFile {
  filename: string;
  subfolder?: string;
  type?: string;
}

/** Media kind of an output bucket (SaveImage / SaveAudio / SaveVideo). */
export type ComfyUIOutputKind = "image" | "audio" | "video";

/** Per-node execution outputs — audio workflows emit `audio`/`videos` instead of `images`. */
export type ComfyUINodeOutput = Partial<
  Record<"images" | "audio" | "videos" | "gifs", ComfyUIOutputFile[]>
>;

/** A downloaded output file with the kind of media it holds. */
export interface ComfyUIDownloadedFile {
  kind: ComfyUIOutputKind;
  buffer: Buffer;
}

/** Output buckets that are not `images`, in history key → media kind form. */
const NON_IMAGE_BUCKETS = [
  ["audio", "audio",],
  ["videos", "video",],
  ["gifs", "video",],
] as const;

/** */
export interface ComfyUINodeInfo {
  name: string;
  display_name: string;
  category: string;
  input: { required?: Record<string, unknown>; optional?: Record<string, unknown> };
  output: unknown[];
  output_name: string[];
}

/** */
export interface ComfyUIClientOptions {
  baseUrl: string;
  timeout?: number;
  pollIntervalMs?: number;
}

/** */
export class ComfyUIClient {
  readonly baseUrl: string;
  private timeout: number;
  private pollIntervalMs: number;

  /**
   * @param options - client options (baseUrl, timeout, poll interval)
   * @throws when the base URL fails provider validation
   */
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
   * @param workflow - ComfyUI API-format workflow JSON
   * @returns prompt_id for tracking execution
   * @throws {Error} When ComfyUI rejects the prompt with a non-OK status.
   */
  async submitWorkflow(workflow: ComfyUIWorkflow,): Promise<ComfyUIPromptResult> {
    const url = `${this.baseUrl}/prompt`;
    const resp = await fetch(url, {
      method: "POST",
      body: jsonStringifyOr({ prompt: workflow, },),
      signal: AbortSignal.timeout(this.timeout,),
    },);

    if (!resp.ok) {
      let body = "unknown";
      try {
        body = await resp.text();
      } catch {
        // Error body read failed — keep "unknown" fallback
      }

      throw new Error(`ComfyUI prompt submission failed [${resp.status}]: ${body}`,);
    }

    return (await resp.json()) as ComfyUIPromptResult;
  }

  /**
   * Poll for execution result by prompt_id.
   *
   * Returns null if not yet complete, throws on failure.
   * @param promptId - prompt id from submitWorkflow
   * @returns completion state with images or error
   * @throws {Error} When the history fetch returns a non-OK status.
   */
  async pollResult(promptId: string,): Promise<{
    done: boolean;
    images?: ComfyUIOutputFile[];
    files?: { kind: ComfyUIOutputKind; file: ComfyUIOutputFile }[];
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
      const images: ComfyUIOutputFile[] = [];
      const files: { kind: ComfyUIOutputKind; file: ComfyUIOutputFile }[] = [];
      if (entry.outputs) {
        for (const nodeOutput of Object.values(entry.outputs,)) {
          for (const file of nodeOutput.images ?? []) {
            images.push(file,);
            files.push({ kind: "image", file, },);
          }

          for (const [bucket, kind,] of NON_IMAGE_BUCKETS) {
            for (const file of nodeOutput[bucket] ?? []) {
              files.push({ kind, file, },);
            }
          }
        }
      }

      return { done: true, images, files, };
    }

    if (entry.status === "failed" || entry.status === "cancelled") {
      return { done: true, error: entry.error ?? `execution ${entry.status}`, };
    }

    return { done: false, };
  }

  /**
   * Wait for workflow completion with polling.
   * @param promptId - the prompt_id from submitWorkflow
   * @param timeoutMs - max wait time in ms (overrides client timeout)
   * @returns list of generated image filenames
   * @throws {Error} When execution reports failure or the deadline elapses first.
   */
  async waitForFiles(
    promptId: string,
    timeoutMs?: number,
  ): Promise<{ kind: ComfyUIOutputKind; file: ComfyUIOutputFile }[]> {
    const deadline = Date.now() + (timeoutMs ?? this.timeout);

    while (Date.now() < deadline) {
      const result = await this.pollResult(promptId,);

      if (result.done) {
        if (result.error) {
          throw new Error(`ComfyUI execution failed: ${result.error}`,);
        }

        return result.files ?? [];
      }

      await new Promise((r,) => setTimeout(r, this.pollIntervalMs,));
    }

    throw new Error("ComfyUI execution timed out",);
  }

  /**
   * Wait for workflow completion, returning image filenames (back-compat view
   * of `waitForFiles`).
   * @param promptId - the prompt_id from submitWorkflow
   * @param timeoutMs - max wait time in ms (overrides client timeout)
   * @returns list of generated image filenames
   * @throws {Error} When execution reports failure or the deadline elapses first.
   */
  async waitForCompletion(promptId: string, timeoutMs?: number,): Promise<string[]> {
    const files = await this.waitForFiles(promptId, timeoutMs,);
    return files.filter((f,) => f.kind === "image").map((f,) => f.file.filename);
  }

  /**
   * Cancel a running execution.
   * @param _promptId
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
   * @returns node info keyed by node name
   * @throws {Error} When object_info returns a non-OK status.
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
   * @param filename - as returned from pollResult / waitForCompletion
   * @param subfolder - optional subfolder from ComfyUI output
   * @param type - output type ("output" default, "temp")
   * @returns the image bytes
   * @throws {Error} When the image fetch returns a non-OK status.
   * @throws {SafeBufferError} When the bytes exceed the safe buffer limit.
   */
  async downloadImage(
    filename: string,
    subfolder?: string,
    type: "output" | "temp" = "output",
  ): Promise<Buffer> {
    return this.downloadFile({ filename, subfolder, type, },);
  }

  /**
   * Download any ComfyUI output file (image, audio, video) by reference.
   * @param file - output file reference from pollResult / waitForFiles
   * @returns the file bytes
   * @throws {Error} When the view fetch returns a non-OK status.
   * @throws {SafeBufferError} When the bytes exceed the safe buffer limit.
   */
  async downloadFile(file: ComfyUIOutputFile,): Promise<Buffer> {
    const params = new URLSearchParams({ filename: file.filename, type: file.type ?? "output", },);
    if (file.subfolder) { params.set("subfolder", file.subfolder,); }

    const url = `${this.baseUrl}/view?${params.toString()}`;
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(30_000,),
    },);

    if (!resp.ok) {
      throw new Error(`ComfyUI view download failed [${resp.status}]: ${file.filename}`,);
    }

    const result = safeFromUint8Array(new Uint8Array(await resp.arrayBuffer(),),);
    if (!result.ok) { throw result.error; }
    return result.buffer;
  }

  /**
   * Run a workflow end-to-end: submit → wait → download images.
   * @param workflow
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

  /**
   * Run a workflow end-to-end: submit → wait → download every output file.
   * @param workflow
   * @returns downloaded files tagged with their media kind
   */
  async runWorkflowFiles(workflow: ComfyUIWorkflow,): Promise<ComfyUIDownloadedFile[]> {
    const { prompt_id, } = await this.submitWorkflow(workflow,);
    const refs = await this.waitForFiles(prompt_id,);

    const files: ComfyUIDownloadedFile[] = [];
    for (const { kind, file, } of refs) {
      files.push({ kind, buffer: await this.downloadFile(file,), },);
    }

    return files;
  }

  /**
   * Upload an input image for LoadImage nodes.
   * @param buffer - image bytes
   * @param filename - name the file gets in the ComfyUI input directory
   * @returns the stored filename (pass to LoadImage's `image` input)
   */
  async uploadImage(buffer: Buffer, filename: string,): Promise<string> {
    return uploadImageToComfy(this.baseUrl, this.timeout, buffer, filename,);
  }
}
