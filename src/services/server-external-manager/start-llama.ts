// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { spawn, } from "bun";
import { load as parseYaml, } from "js-yaml";
import { readFileSync, } from "node:fs";
import { homedir, } from "node:os";
import { resolve, } from "node:path";
import {
  BINARY_CANDIDATES,
  findBinary,
  isHuggingFaceRef,
  isPortFree,
  waitForHealth,
  waitForPort,
} from "../external-server-utils";
import type {
  LlamaCppOptions,
  LlamaSwapOptions,
  ServerExternalHost,
  ServerInstance,
} from "./types";

// ── Helper: expand ~ to home directory ─────────────────────
function expandPath(path: string,): string {
  if (path.startsWith("~",)) {
    return `${homedir()}${path.slice(1,)}`;
  }
  return path;
}

/** Append model / hardware flags. */
function appendLlamaHardwareArgs(args: string[], opts: LlamaCppOptions,): void {
  if (opts.alias) { args.push("--alias", opts.alias,); }
  args.push("--ctx-size", String(opts.ctxSize ?? 8192,),);
  if (opts.threads) { args.push("-t", String(opts.threads,),); }
  if (opts.nGpuLayers) { args.push("--gpu-layers", opts.nGpuLayers,); }
  if (opts.device) { args.push("--device", opts.device,); }
  if (opts.mlock) { args.push("--mlock",); }
  if (opts.ropeScaling) { args.push("--rope-scaling", opts.ropeScaling,); }
  if (opts.ropeScale) { args.push("--rope-scale", String(opts.ropeScale,),); }
}

/** Append KV cache flags. */
function appendLlamaCacheArgs(args: string[], opts: LlamaCppOptions,): void {
  if (opts.cacheTypeK) { args.push("-ctk", opts.cacheTypeK,); }
  if (opts.cacheTypeV) { args.push("-ctv", opts.cacheTypeV,); }
  if (opts.cacheTypeKD) { args.push("-ctkd", opts.cacheTypeKD,); }
  if (opts.cacheTypeVD) { args.push("-ctvd", opts.cacheTypeVD,); }
  if (opts.cacheRam) { args.push("--cache-ram", String(opts.cacheRam,),); }
  if (opts.flashAttn) { args.push("-fa", opts.flashAttn,); }
  if (opts.swaFull) { args.push("--swa-full",); }
}

/** Append sampler + server behavior flags. */
function appendLlamaSamplerArgs(args: string[], opts: LlamaCppOptions,): void {
  if (opts.temp !== undefined) { args.push("--temp", String(opts.temp,),); }
  if (opts.topK !== undefined) { args.push("--top-k", String(opts.topK,),); }
  if (opts.topP !== undefined) { args.push("--top-p", String(opts.topP,),); }
  if (opts.minP !== undefined) { args.push("--min-p", String(opts.minP,),); }
  if (opts.repeatPenalty !== undefined) { args.push("--repeat-penalty", String(opts.repeatPenalty,),); }
  if (opts.parallelRequests) { args.push("-np", String(opts.parallelRequests,),); }
  if (opts.fit) { args.push("--fit", "on",); }
}

/** Append advanced / speculative-decoding flags. */
function appendLlamaAdvancedArgs(args: string[], opts: LlamaCppOptions,): void {
  if (opts.specType) { args.push("--spec-type", opts.specType,); }
  if (opts.specDraftNMin !== undefined) { args.push("--spec-draft-n-min", String(opts.specDraftNMin,),); }
  if (opts.specDraftNMax !== undefined) { args.push("--spec-draft-n-max", String(opts.specDraftNMax,),); }
  if (opts.reasoningBudget !== undefined) { args.push("--reasoning-budget", String(opts.reasoningBudget,),); }
  if (opts.jinja !== undefined && !opts.jinja) { args.push("--no-jinja",); }
}
/**
 * Start llama.cpp server on given port.
 * modelPath accepts local path (/path/to/model.gguf) or HuggingFace ID (org/repo:quant).
 * Skips (returns null) if binary not found or port unavailable.
 */
export async function startLlamaCpp(
  host: ServerExternalHost,
  opts: LlamaCppOptions,
): Promise<ServerInstance | null> {
  const binary = findBinary("llama-cpp",);
  if (!binary) {
    host.log.warn("llama-server not found in PATH — skipping auto-start", {
      binaryCandidates: BINARY_CANDIDATES["llama-cpp"],
    },);
    return null;
  }
  if (!(await isPortFree(opts.port,))) {
    host.log.warn("Port in use — skipping llama-cpp auto-start", { port: opts.port, },);
    return null;
  }

  const isHF = isHuggingFaceRef(opts.modelPath,);
  const modelFlag = isHF ? "-hf" : "-m";
  const modelValue = isHF ? opts.modelPath : resolve(expandPath(opts.modelPath,),);
  host.log.info("Starting llama.cpp", { binary, port: opts.port, model: modelValue, isHF, },);

  const args: string[] = [
    binary,
    modelFlag,
    modelValue,
    "--port",
    String(opts.port,),
    "--host",
    "127.0.0.1",
    "--no-ui",
  ];

  appendLlamaHardwareArgs(args, opts,);
  appendLlamaCacheArgs(args, opts,);
  appendLlamaSamplerArgs(args, opts,);
  appendLlamaAdvancedArgs(args, opts,);

  if (opts.extraArgs) { args.push(...opts.extraArgs,); }

  const proc = spawn({ cmd: args, stdout: "pipe", stderr: "pipe", },);

  const ready = await waitForHealth(`http://127.0.0.1:${opts.port}/health`, { timeoutMs: 120_000, },);
  if (!ready) {
    proc.kill();
    host.log.warn("llama-cpp did not become ready within timeout", { port: opts.port, },);
    return null;
  }

  const instance: ServerInstance = {
    type: "llama-cpp",
    process: proc,
    port: opts.port,
    pid: proc.pid,
    startedAt: Date.now(),
  };
  host.instances.push(instance,);
  host.log.info("llama.cpp ready", { port: opts.port, pid: proc.pid, },);
  return instance;
}

/**
 * Start llama-swap proxy with a config file.
 */
export async function startLlamaSwap(
  host: ServerExternalHost,
  opts: LlamaSwapOptions,
): Promise<ServerInstance | null> {
  const binary = findBinary("llama-swap",);
  if (!binary) {
    host.log.warn("llama-swap not found in PATH — skipping auto-start",);
    return null;
  }

  const resolvedConfig = resolve(expandPath(opts.configPath,),);
  // llama-swap listens on `startPort` from its own config (default 8080).
  // The spawn command does not pass --port, so read the real port here.
  const port = resolveLlamaSwapPort(host, resolvedConfig,);
  host.log.info("Starting llama-swap", { binary, config: resolvedConfig, port, },);
  const proc = spawn({
    cmd: [binary, "--config", resolvedConfig, "--listen", `127.0.0.1:${port}`,],
    stdout: "pipe",
    stderr: "pipe",
  },);

  // Probe the actual listening port (llama-swap has no guaranteed /health route).
  const ready = await waitForPort(port, { timeoutMs: 30_000, },);
  if (!ready) {
    proc.kill();
    host.log.warn("llama-swap did not become ready within timeout", { port, },);
    return null;
  }

  const instance: ServerInstance = {
    type: "llama-swap",
    process: proc,
    port,
    pid: proc.pid,
    startedAt: Date.now(),
  };
  host.instances.push(instance,);
  host.log.info("llama-swap ready", { pid: proc.pid, port, },);
  return instance;
}

/**
 * Read `startPort` from a llama-swap config file.
 * llama-swap listens on this port (the spawn command does not override it).
 * Falls back to 8080 if the file is missing or unreadable.
 */
function resolveLlamaSwapPort(host: ServerExternalHost, configPath: string,): number {
  try {
    const content = readFileSync(configPath, "utf8",);
    const parsed = parseYaml(content,) as { startPort?: number } | null;
    if (parsed && typeof parsed.startPort === "number") {
      return parsed.startPort;
    }
  } catch (error) {
    host.log.warn("Could not read llama-swap config for port — defaulting to 8080", {
      config: configPath,
      error: error instanceof Error ? error.message : String(error,),
    },);
  }
  return 8080;
}
