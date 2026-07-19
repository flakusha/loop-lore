/**
 * Shared utilities for external server management (llama.cpp, sd.cpp).
 *
 * Used by both the production ServerExternalManager and the e2e test helper.
 */

import type { Subprocess, } from "bun";
import { platform, } from "node:process";

// ── Binary discovery ──────────────────────────────────────

const WINDOWS_EXE_SUFFIX = ".exe";

export const BINARY_CANDIDATES = {
  "llama-cpp": ["llama-server", "llama-server-vk",],
  "llama-swap": ["llama-swap",],
  "sd-cpp": ["sd-server",],
} as const;

function getBinaryNameWithSuffix(name: string,): string[] {
  const names = [name,];
  if (platform === "win32") {
    names.push(`${name}${WINDOWS_EXE_SUFFIX}`,);
  }
  return names;
}

export function findBinary(type: keyof typeof BINARY_CANDIDATES,): string | null {
  const candidates = BINARY_CANDIDATES[type];
  for (const name of candidates) {
    for (const actualName of getBinaryNameWithSuffix(name,)) {
      const result = Bun.which(actualName,);
      if (result) { return result; }
    }
  }
  return null;
}

// ── Port verification ─────────────────────────────────────

export function isPortFree(port: number,): boolean {
  try {
    const server = Bun.serve({ port, fetch: () => new Response("ok",), },);
    void (async () => {
      try {
        await server.stop();
      } catch {
        /* probe port check — ignore */
      }
    })();
    return true;
  } catch {
    return false;
  }
}

// ── Health check option types ─────────────────────────────

export interface WaitForHealthOptions {
  timeoutMs: number;
  intervalMs?: number;
}

export interface WaitForStdoutOptions {
  signal: string;
  timeoutMs: number;
  encoding?: string;
}

export interface WaitForPortOptions {
  timeoutMs: number;
}

// ── Health checks ─────────────────────────────────────────

export async function waitForHealth(url: string, opts: WaitForHealthOptions,): Promise<boolean> {
  const intervalMs = opts.intervalMs ?? 500;
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000,), },);
      if (res.ok) { return true; }
    } catch {
      // Still starting
    }
    await new Promise((r,) => setTimeout(r, intervalMs,));
  }
  return false;
}

export async function waitForStdout(proc: Subprocess, opts: WaitForStdoutOptions,): Promise<boolean> {
  const deadline = Date.now() + opts.timeoutMs;
  const stdout = proc.stdout;
  if (!stdout || typeof stdout === "number") { return false; }
  const reader = stdout.getReader();

  let buffer = "";
  try {
    while (Date.now() < deadline) {
      const { value, done, } = await reader.read();
      if (done) { break; }
      buffer += new TextDecoder().decode(value,);
      if (buffer.includes(opts.signal,)) { return true; }
      await new Promise((r,) => setTimeout(r, 200,));
    }
  } catch {
    // stream closed
  }
  return false;
}

export async function waitForPort(port: number, opts: WaitForPortOptions,): Promise<boolean> {
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000,), },);
      return true;
    } catch {
      await new Promise((r,) => setTimeout(r, 500,));
    }
  }
  return false;
}

export function isHuggingFaceRef(path: string,): boolean {
  return /^[\w-]+\/[\w.-]+:\w+$/i.test(path,);
}
