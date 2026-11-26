// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * external-tools.ts — rtk and lean-ctx exposed as harness tools.
 *
 * The assistant must not reinvent shell output filtering or anchored file
 * edits. These definitions delegate to the installed binaries through argv
 * only (no shell string), scrub loop-lore secrets from the child env, and
 * rely on `executePluginTool` for role gating, path scoping and the timeout.
 * Registration is opt-in via LOOP_LORE_EXTERNAL_TOOLS=1: a production chat
 * server must not expose repository file editing by default.
 */
import { scrubEnv, } from "../integrations/harness/env-scrub";
import type { ToolDefinition, ToolResult, } from "../plugins/types";
import { jsonStringifyOr, } from "../utils";

/** Env flag that registers these tools and their prompt catalog section. */
export const EXTERNAL_TOOLS_ENV = "LOOP_LORE_EXTERNAL_TOOLS";

/** Canonical tool names — referenced by the prompt catalog and tests. */
export const RTK_RUN = "rtk_run";
export const CTX_CALL = "ctx_call";

/** Read-only rtk subcommands; mutating/proxy runners are intentionally absent. */
export const RTK_SUBCOMMANDS: ReadonlySet<string> = new Set([
  "read",
  "grep",
  "rg",
  "find",
  "ls",
  "tree",
  "diff",
  "json",
  "wc",
  "status",
  "gain",
],);

/** lean-ctx MCP tools safe to expose; shell/execute/index/session are absent. */
export const CTX_TOOLS: ReadonlySet<string> = new Set([
  "ctx_read",
  "ctx_patch",
  "ctx_glob",
  "ctx_search",
  "ctx_tree",
  "ctx_delta",
  "ctx_compose",
  "ctx_callgraph",
  "ctx_graph",
],);

/** Child stdout ceiling; truncation is reported in the tool result metadata. */
export const MAX_EXTERNAL_OUTPUT_BYTES = 64 * 1024;
const MAX_CTX_ARGS_BYTES = 32 * 1024;
const DEFAULT_TIMEOUT_MS = 20_000;

/** Minimal structural contract satisfied by `Bun.spawn`. */
export interface ExternalProcess {
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  exited: Promise<number>;
  kill: () => void;
}

/** Options passed to the spawn seam. */
export interface ExternalSpawnOptions {
  cmd: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdin: "ignore";
  stdout: "pipe";
  stderr: "pipe";
}

/** Injectable spawn seam; production uses `Bun.spawn`. */
export type ExternalSpawn = (options: ExternalSpawnOptions,) => ExternalProcess;

/** Builder options for the two tool definitions. */
export interface ExternalToolOptions {
  spawn?: ExternalSpawn;
  cwd?: string;
  timeoutMs?: number;
}

/**
 * Whether the operator opted into external tools.
 * @param env - env to inspect (defaults to the process environment)
 * @returns true only for the exact value "1".
 */
export function externalToolsEnabled(env: NodeJS.ProcessEnv = process.env,): boolean {
  return env[EXTERNAL_TOOLS_ENV] === "1";
}

function errorResult(message: string,): ToolResult {
  return { content: jsonStringifyOr({ error: message, },), isError: true, };
}

async function readCapped(stream: ReadableStream<Uint8Array>,): Promise<string> {
  const text = await new Response(stream,).text();
  return text.length > MAX_EXTERNAL_OUTPUT_BYTES ? text.slice(0, MAX_EXTERNAL_OUTPUT_BYTES,) : text;
}

interface ExternalRun {
  code: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
}

/** Spawn with scrubbed env, drained stderr and a hard kill on timeout. */
async function runExternal(
  argv: string[],
  options: ExternalToolOptions,
): Promise<ExternalRun> {
  const spawn = options.spawn ?? ((opts,) => Bun.spawn(opts,) as unknown as ExternalProcess);
  const child = spawn({
    cmd: argv,
    cwd: options.cwd ?? process.cwd(),
    env: scrubEnv(),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  },);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject,) => {
    timer = setTimeout(() => {
      child.kill();
      reject(new Error(`external tool timed out after ${options.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`,),);
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS,);
  },);

  try {
    await Promise.race([child.exited, deadline,],);
  } finally {
    if (timer !== undefined) { clearTimeout(timer,); }
  }

  const stdout = await readCapped(child.stdout,);
  const stderr = await readCapped(child.stderr,);

  return {
    code: await child.exited,
    stdout,
    stderr,
    truncated: stdout.length === MAX_EXTERNAL_OUTPUT_BYTES,
  };
}

function toResult(label: string, run: ExternalRun,): ToolResult {
  if (run.code !== 0) {
    return errorResult(`${label} exited ${run.code}: ${run.stderr.slice(0, 2000,)}`,);
  }

  return {
    content: run.stdout,
    metadata: { tool: label, bytes: run.stdout.length, truncated: run.truncated, },
  };
}

/** Build the rtk tool. Read-only subcommands only; argv never passes a shell. */
export function createRtkRunTool(options: ExternalToolOptions = {},): ToolDefinition {
  return {
    name: RTK_RUN,
    description:
      "Run a read-only rtk command on repository source or text documents. Pass an argv array whose first item is a read-only rtk subcommand (read, grep, rg, find, ls, tree, diff, json, wc, status, gain). Never invent a shell or file-read tool.",
    parameters: {
      type: "object",
      properties: {
        argv: {
          type: "array",
          items: { type: "string", },
          minItems: 1,
          description: "rtk subcommand followed by literal arguments.",
        },
      },
      required: ["argv",],
      additionalProperties: false,
    },
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    handler: async (params,): Promise<ToolResult> => {
      const argv = params.argv;
      if (
        !Array.isArray(argv,) || argv.length === 0 ||
        !argv.every((item,) => typeof item === "string")
      ) {
        return errorResult("argv must be a non-empty array of strings",);
      }

      if (!RTK_SUBCOMMANDS.has(argv[0]!,)) {
        return errorResult(`rtk subcommand "${argv[0]}" is not allowed`,);
      }

      try {
        return toResult("rtk", await runExternal(["rtk", ...argv,], options,),);
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error,),);
      }
    },
  };
}

/** Build the lean-ctx tool. Args are forwarded verbatim to `lean-ctx call`. */
export function createCtxCallTool(options: ExternalToolOptions = {},): ToolDefinition {
  return {
    name: CTX_CALL,
    description:
      "Call one lean-ctx MCP tool for structured source/text work: ctx_read, ctx_patch, ctx_glob, ctx_search, ctx_tree, ctx_delta, ctx_compose, ctx_callgraph or ctx_graph. Pass {tool, args}; anchored hashes come from a prior ctx_read. Never invent a raw file-write tool.",
    parameters: {
      type: "object",
      properties: {
        tool: { type: "string", enum: [...CTX_TOOLS,], },
        args: {
          type: "object",
          description: "Arguments for the selected lean-ctx tool.",
        },
      },
      required: ["tool", "args",],
      additionalProperties: false,
    },
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    handler: async (params,): Promise<ToolResult> => {
      const tool = params.tool;
      const args = params.args;
      if (typeof tool !== "string" || !CTX_TOOLS.has(tool,)) {
        return errorResult(`lean-ctx tool ${String(tool,)} is not allowed`,);
      }

      if (args === null || typeof args !== "object" || Array.isArray(args,)) {
        return errorResult("args must be an object",);
      }

      const json = jsonStringifyOr(args,);
      if (json.length > MAX_CTX_ARGS_BYTES) {
        return errorResult(`args exceed ${MAX_CTX_ARGS_BYTES} bytes`,);
      }

      try {
        return toResult(
          tool,
          await runExternal([
            "lean-ctx",
            "call",
            tool,
            "--project-root",
            options.cwd ?? process.cwd(),
            "--json",
            json,
          ], options,),
        );
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error,),);
      }
    },
  };
}

/** Default definitions used by the core plugin registration. */
export const rtkRunTool = createRtkRunTool();
export const ctxCallTool = createCtxCallTool();
