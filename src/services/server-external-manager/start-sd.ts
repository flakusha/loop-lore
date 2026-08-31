// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { spawn, } from "bun";
import { homedir, } from "node:os";
import { resolve, } from "node:path";
import {
  findBinary,
  isPortFree,
  waitForPort,
} from "../external-server-utils";
import type { SdCppOptions, ServerExternalHost, ServerInstance, } from "./types";

// ── Helper: expand ~ to home directory ─────────────────────
/**
 * @param path
 */
function expandPath(path: string,): string {
  if (path.startsWith("~",)) {
    return `${homedir()}${path.slice(1,)}`;
  }
  return path;
}

/**
 * Append the model-loading arguments (checkpoint vs diffusion mode).
 * @param args - Arg list being built
 * @param opts - sd-cpp options
 * @param modelType - Resolved loading mode
 * @param host - Host for warning logs
 */
function appendModelArgs(
  args: string[],
  opts: SdCppOptions,
  modelType: string,
  host: ServerExternalHost,
): void {
  const modelPath = expandPath(opts.modelPath,);
  if (modelType === "diffusion") {
    if (!opts.llmPath) {
      host.log.warn(
        "sd-cpp diffusion model missing llmPath — model may fail to load if it needs a text encoder",
      );
    }
    args.push("--diffusion-model", resolve(modelPath,),);
    if (opts.llmPath) { args.push("--llm", resolve(expandPath(opts.llmPath,),),); }
    if (opts.vaePath) { args.push("--vae", resolve(expandPath(opts.vaePath,),),); }
  } else {
    args.push("-m", resolve(modelPath,),);
  }
}

/**
 * Append path-valued flags (text encoders, components, upscalers).
 * @param args
 * @param opts
 */
function appendPathFlags(args: string[], opts: SdCppOptions,): void {
  if (opts.clipLPath) { args.push("--clip_l", resolve(expandPath(opts.clipLPath,),),); }
  if (opts.clipGPath) { args.push("--clip_g", resolve(expandPath(opts.clipGPath,),),); }
  if (opts.t5xxlPath) { args.push("--t5xxl", resolve(expandPath(opts.t5xxlPath,),),); }
  if (opts.vaeFormat) { args.push("--vae-format", opts.vaeFormat,); }
  if (opts.controlNetPath) { args.push("--control-net", resolve(expandPath(opts.controlNetPath,),),); }
  if (opts.loraDir) { args.push("--lora-model-dir", resolve(expandPath(opts.loraDir,),),); }
  if (opts.taesdPath) { args.push("--taesd", resolve(expandPath(opts.taesdPath,),),); }
  if (opts.hiresUpscalersDir) {
    args.push("--hires-upscalers-dir", resolve(expandPath(opts.hiresUpscalersDir,),),);
  }
  if (opts.embdDir) { args.push("--embd-dir", resolve(expandPath(opts.embdDir,),),); }
  if (opts.photoMakerPath) { args.push("--photo-maker", resolve(expandPath(opts.photoMakerPath,),),); }
  if (opts.upscaleModelPath) { args.push("--upscale-model", resolve(expandPath(opts.upscaleModelPath,),),); }
}

/**
 * Append boolean flags (add only when enabled).
 * @param args
 * @param opts
 */
function appendBooleanFlags(args: string[], opts: SdCppOptions,): void {
  if (opts.fa) { args.push("--fa",); }
  if (opts.diffusionFA) { args.push("--diffusion-fa",); }
  if (opts.vaeTiling) { args.push("--vae-tiling",); }
  if (opts.eagerLoad) { args.push("--eager-load",); }
  if (opts.offloadToCPU) { args.push("--offload-to-cpu",); }
  if (opts.streamLayers) { args.push("--stream-layers",); }
  if (opts.autoFit) { args.push("--auto-fit",); }
}

/**
 * Append value flags (add only when set).
 * @param args
 * @param opts
 */
function appendValueFlags(args: string[], opts: SdCppOptions,): void {
  if (opts.maxVram) { args.push("--max-vram", opts.maxVram,); }
  if (opts.backend) { args.push("--backend", opts.backend,); }
  if (opts.rng) { args.push("--rng", opts.rng,); }
  if (opts.samplerRng) { args.push("--sampler-rng", opts.samplerRng,); }
  if (opts.type) { args.push("--type", opts.type,); }
  if (opts.prediction) { args.push("--prediction", opts.prediction,); }
  if (opts.cacheMode) { args.push("--cache-mode", opts.cacheMode,); }
  if (opts.cacheOption) { args.push("--cache-option", opts.cacheOption,); }
}
/**
 * Start sd-server on given port.
 *
 * Supports two model loading modes:
 * - checkpoint (default): -m modelPath — standalone full model, no llm/vae needed
 * - diffusion: --diffusion-model modelPath — requires --llm (text encoder), --vae optional
 * @param host
 * @param opts
 */
export async function startSdCpp(
  host: ServerExternalHost,
  opts: SdCppOptions,
): Promise<ServerInstance | null> {
  const binary = findBinary("sd-cpp",);
  if (!binary) {
    host.log.warn("sd-server not found in PATH — skipping auto-start",);
    return null;
  }
  if (!(await isPortFree(opts.port,))) {
    host.log.warn("Port in use — skipping sd-cpp auto-start", { port: opts.port, },);
    return null;
  }

  const modelType = opts.modelType ?? "checkpoint";
  const args: string[] = [binary, "--listen-port", String(opts.port,), "-l", "127.0.0.1",];

  appendModelArgs(args, opts, modelType, host,);
  appendPathFlags(args, opts,);
  appendBooleanFlags(args, opts,);
  appendValueFlags(args, opts,);

  // ── Extra args ────────────────────────────────────────
  if (opts.extraArgs) { args.push(...opts.extraArgs,); }

  host.log.info("Starting sd-server", { binary, port: opts.port, modelType, model: opts.modelPath, },);
  const proc = spawn({
    cmd: args,
    stdout: "pipe",
    stderr: "pipe",
  },);

  // sd-server: no liveliness probe. Use TCP port + stdout detection.
  const portReady = await waitForPort(opts.port, { timeoutMs: 60_000, },);
  if (!portReady) {
    proc.kill();
    host.log.warn("sd-cpp did not start within timeout", { port: opts.port, },);
    return null;
  }

  const instance: ServerInstance = {
    type: "sd-cpp",
    process: proc,
    port: opts.port,
    pid: proc.pid,
    startedAt: Date.now(),
  };
  host.instances.push(instance,);
  host.log.info("sd-server ready", { port: opts.port, pid: proc.pid, modelType, },);
  return instance;
}
