// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { spawn, } from "bun";
import { resolve, } from "node:path";
import {
  BINARY_CANDIDATES,
  findBinary,
  isPortFree,
  waitForHealth,
} from "../external-server-utils";
import type { HonkboxOptions, ServerExternalHost, ServerInstance, } from "./types";

// ── Helper: expand ~ to home directory ─────────────────────
/**
 * @param path
 */
function expandPath(path: string,): string {
  if (path.startsWith("~/",)) {
    return `${process.env.HOME ?? ""}${path.slice(1,)}`;
  }

  return path;
}

/**
 * Start honkbox server (`honkbox serve`) on the given port.
 *
 * Mirrors the llama.cpp spawn path: findBinary → isPortFree → spawn →
 * waitForHealth → instance push. Skips (returns null) when the binary is
 * missing or the port is unavailable; kills the process when the health
 * endpoint never becomes ready.
 *
 * Bind policy: loop-lore always starts honkbox loopback (host defaults to
 * 127.0.0.1). Honkbox itself refuses unauthenticated non-loopback binds, so a
 * non-loopback `host` simply fails closed upstream — loop-lore never passes
 * `--allow-unauthenticated-bind`.
 * @param host
 * @param opts
 * @returns {Promise<ServerInstance | null>}
 */
export async function startHonkbox(
  host: ServerExternalHost,
  opts: HonkboxOptions,
): Promise<ServerInstance | null> {
  const binary = findBinary("honkbox",);
  if (!binary) {
    host.log.warn("honkbox not found in PATH — skipping auto-start", {
      binaryCandidates: BINARY_CANDIDATES["honkbox"],
    },);

    return null;
  }

  if (!(await isPortFree(opts.port,))) {
    host.log.warn("Port in use — skipping honkbox auto-start", { port: opts.port, },);
    return null;
  }

  const bindHost = opts.host ?? "127.0.0.1";
  const args: string[] = [
    binary,
    "serve",
    "--port",
    String(opts.port,),
    "--host",
    bindHost,
  ];

  if (opts.configPath) {
    args.push("--config", resolve(expandPath(opts.configPath,),),);
  }

  if (opts.extraArgs) { args.push(...opts.extraArgs,); }

  host.log.info("Starting honkbox", { binary, port: opts.port, host: bindHost, },);
  const proc = spawn({
    cmd: args,
    stdout: "pipe",
    stderr: "pipe",
  },);

  // GET /health is honkbox's readiness endpoint (exempt from auth).
  const ready = await waitForHealth(`http://127.0.0.1:${opts.port}/health`, { timeoutMs: 60_000, },);
  if (!ready) {
    proc.kill();
    host.log.warn("honkbox did not become ready within timeout", { port: opts.port, },);
    return null;
  }

  const instance: ServerInstance = {
    type: "honkbox",
    process: proc,
    port: opts.port,
    pid: proc.pid,
    startedAt: Date.now(),
    launch: { kind: "honkbox", opts, },
  };

  host.instances.push(instance,);
  host.log.info("honkbox ready", { port: opts.port, pid: proc.pid, },);
  return instance;
}
