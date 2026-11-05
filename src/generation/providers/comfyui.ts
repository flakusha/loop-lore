// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ComfyUI Provider — HTTP/WebSocket client for ComfyUI API. Submits
 * workflow JSON, polls for execution, and retrieves generated images.
 * Reference: docs/spec/integrations/image-generation.md §ComfyUI
 */

import { jsonStringifyOr, } from "../../utils";
import { validateProviderUrl, } from "../../utils/url-validation";
import { downloadComfyFile, } from "./comfyui-download";
import {
  type ComfyUIPollResult,
  pollComfyResult,
  waitForComfyFiles,
} from "./comfyui-poll";
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

// Output buckets that are not `images` moved to comfyui-poll.ts with the polling code.

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
  /**
   * Optional credential for reverse-proxy-fronted servers — sent as
   * `Authorization: Bearer <apiKey>` on every request when set. Stock
   * ComfyUI is unauthenticated, so this stays undefined for local engines.
   */
  apiKey?: string;
}

/** */
export class ComfyUIClient {
  readonly baseUrl: string;
  private timeout: number;
  private pollIntervalMs: number;
  private apiKey?: string;

  /**
   * @param options - client options (baseUrl, timeout, poll interval, credential)
   * @throws when the base URL fails provider validation
   */
  constructor(options: ComfyUIClientOptions,) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "",);
    this.timeout = options.timeout ?? 120_000;
    this.pollIntervalMs = options.pollIntervalMs ?? 500;
    this.apiKey = options.apiKey;

    const validated = validateProviderUrl(this.baseUrl,);
    if (!validated.ok) {
      throw new Error(`Invalid ComfyUI URL: ${validated.error}`,);
    }
  }

  /** Auth headers for proxy-fronted engines; empty for stock ComfyUI. */
  private authHeaders(): Record<string, string> {
    return this.apiKey ? { authorization: `Bearer ${this.apiKey}`, } : {};
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
      headers: this.authHeaders(),
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
  async pollResult(promptId: string,): Promise<ComfyUIPollResult> {
    return pollComfyResult(this.baseUrl, promptId, this.apiKey,);
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
    return waitForComfyFiles(this.baseUrl, promptId, {
      timeoutMs: timeoutMs ?? this.timeout,
      pollIntervalMs: this.pollIntervalMs,
      apiKey: this.apiKey,
    },);
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
      headers: this.authHeaders(),
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
    return downloadComfyFile(this.baseUrl, file, this.apiKey,);
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
    return uploadImageToComfy(this.baseUrl, this.timeout, buffer, filename, this.apiKey,);
  }
}
