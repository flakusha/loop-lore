// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The assistant tool guard — Layer 1 → Layer 2 → Layer 3 → handler → audit.
 *
 * Every assistant tool call goes through {@link runGuardedToolCall}: the
 * capability matrix decides, the judge reviews what the matrix flagged, the
 * sandbox constrains what the handler may touch, and the audit trail records
 * the outcome.
 *
 * The judge guards the natural-language path. A slash command is the user's
 * own explicit invocation — there is no wrapper to judge there, and the
 * role gate plus the capability matrix already apply. Requiring an auxiliary
 * model for every review-tier slash command would deny ordinary commands on
 * any instance without an auxiliary model configured.
 */
import type { Kysely, } from "kysely";
import { dirname, resolve, } from "node:path";
import { resolveUploadDir, } from "../../assets/service/file-system";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { getChildLogger, } from "../../logger";
import { DEFAULT_LIMITS, } from "../capabilities";
import type { CommandContext, CommandResult, } from "../commands/registry";
import {
  getCommand,
  getCommandCapabilities,
  getCommandLimits,
  getCommandNetworkHosts,
  getCommandRequirement,
} from "../commands/registry";
import { recordToolCallAudit, } from "./audit";
import type { ToolAuditVerdict, } from "./audit";
import { judgeToolCall, } from "./judge";
import type { JudgeRequest, JudgeVerdict, } from "./judge";
import { evaluateCapabilities, } from "./matrix";
import { runInSandbox, } from "./sandbox";
import type { SandboxContext, } from "./sandbox";

/** The Layer 2 judge, replaceable in tests. */
export type GuardJudge = (request: JudgeRequest,) => Promise<JudgeVerdict>;

/** The Layer 3 sandbox, replaceable in tests. */
export type GuardSandbox = <T,>(ctx: SandboxContext, fn: () => Promise<T>,) => Promise<T>;

/** Fields every guarded tool call carries. */
interface ToolCallBase {
  /** Registered command name. */
  tool: string;
  /** Positional arguments the handler runs with. */
  args: string[];
  /** The command context handed to the handler. */
  ctx: CommandContext;
  /** Test seam: replaces the Layer 2 judge. */
  judge?: GuardJudge;
  /** Test seam: replaces the Layer 3 sandbox. */
  sandbox?: GuardSandbox;
}

/**
 * A guarded tool call.
 *
 * `origin` discriminates the two dispatch paths: an explicit slash command
 * carries no wrapper, a natural-language tool request carries the message it
 * was derived from.
 */
export type ToolCallRequest =
  | (ToolCallBase & { origin: "slash-command" })
  | (ToolCallBase & { origin: "natural-language"; content: string });

/** The guard's outcome. */
export interface GuardOutcome {
  /** Whether the tool ran. */
  allowed: boolean;
  /** Why the guard decided as it did. */
  reason: string;
  /** The handler's result, when the call was allowed. */
  result?: CommandResult;
}

/**
 * Derive the hosts a tool call may reach from the configured providers.
 *
 * Every provider the instance talks to is configured with its base URL, so
 * the configured hosts are the allowlist. A provider-less instance derives
 * an empty list, and an EMPTY effective allowlist refuses every outbound
 * request — the guard fails closed, it never fails open.
 * @param config - Application config
 * @returns The allowed hosts (URLs or bare host names)
 */
function allowedHosts(config: Config | undefined,): string[] {
  const providers = config?.generation?.providers;
  if (!providers) { return []; }
  const urls: string[] = [];
  for (const provider of providers.openaiCompatible ?? []) { urls.push(provider.baseUrl,); }
  if (providers.anthropic) { urls.push(providers.anthropic.baseUrl,); }
  if (providers.ollamaNative) { urls.push(providers.ollamaNative.baseUrl,); }
  for (const provider of providers.sd ?? []) { urls.push(provider.baseUrl,); }
  for (const provider of providers.audio ?? []) { urls.push(provider.baseUrl,); }
  if (providers.libretranslate) { urls.push(providers.libretranslate.baseUrl,); }
  if (providers.deepl) {
    urls.push(providers.deepl.freeTier ? "https://api-free.deepl.com" : "https://api.deepl.com",);
  }

  if (providers.googleTranslate) { urls.push("https://translation.googleapis.com",); }
  return urls.filter((url,) => typeof url === "string" && url.length > 0);
}

/** The filesystem scope of one guarded call. */
interface FsScope {
  /** Directories the call may read from. */
  readPaths: string[];
  /** Directories the call may write to. */
  writePaths: string[];
}

/**
 * Derive the directories a tool call may read from and write to.
 *
 * READ — the asset upload directory. It is the only directory a command
 * handler legitimately reads: verified empirically, with the read scope
 * pinned to the upload dir the whole assistant, assets and command-route
 * suite passes, and the only production read path a handler reaches (the
 * asset service) lives there.
 *
 * WRITE — the upload directory plus the JSONL log directory. The file
 * logger flushes from the CALLER's async context once a burst reaches the
 * queue's batch size, so without the log's directory in the write scope the
 * lines of a chatty call are refused and dropped (the transport swallows
 * the failure). The path is admin-configured, never handler-chosen.
 *
 * Both are resolved to ABSOLUTE paths with the asset service's OWN
 * resolver, so a relative `uploadDir` matches the absolute paths the asset
 * service actually touches — two different resolutions would silently deny
 * legitimate asset writes.
 * @param config - Application config
 * @returns The read and write directories
 */
function allowedPaths(config: Config | undefined,): FsScope {
  const readPaths: string[] = [];
  const writePaths: string[] = [];

  const uploadDir = config?.assets?.uploadDir;
  if (typeof uploadDir === "string" && uploadDir.length > 0) {
    try {
      const root = resolveUploadDir(uploadDir,);
      readPaths.push(root,);
      writePaths.push(root,);
    } catch (error) {
      getChildLogger("assistant-guard",)?.warn("upload dir is unusable — filesystem access denied", {
        uploadDir,
        error: error instanceof Error ? error.message : String(error,),
      },);
    }
  }

  const logPath = config?.logging?.jsonlPath;
  if (typeof logPath === "string" && logPath.length > 0) {
    writePaths.push(resolve(dirname(logPath,),),);
  }

  return { readPaths, writePaths, };
}

/**
 * Run the handler inside the sandbox.
 * @param req - The guarded call
 * @returns The guard's outcome with the handler's result
 */
async function execute(req: ToolCallRequest,): Promise<GuardOutcome> {
  const { tool, args, ctx, } = req;
  const handler = getCommand(tool,);
  if (!handler) {
    return { allowed: false, reason: `\`/${tool}\` is not registered.`, };
  }

  const limits = getCommandLimits(tool,) ?? DEFAULT_LIMITS;
  const sandbox = req.sandbox ?? runInSandbox;
  const fsScope = allowedPaths(ctx.config,);
  const result = await sandbox({
    tool,
    // The effective allowlist is the union of the tool's own declaration and
    // the instance's configured provider hosts. It fails closed: an empty
    // union refuses every outbound request.
    allowedNetworkHosts: [...allowedHosts(ctx.config,), ...(getCommandNetworkHosts(tool,) ?? []),],
    allowedFsReadPaths: fsScope.readPaths,
    allowedFsWritePaths: fsScope.writePaths,
    limits,
  }, async () => await handler(args, ctx,),);

  return { allowed: true, reason: "tool call allowed", result, };
}

/**
 * Run one tool call through the guard.
 *
 * @param req - The tool, its arguments, and where the request came from
 * @param db - Kysely instance used for the audit trail
 * @returns The guard's outcome; the handler runs only when `allowed` is true
 */
export async function runGuardedToolCall(req: ToolCallRequest, db: Kysely<DB>,): Promise<GuardOutcome> {
  const startedAt = Date.now();
  const { tool, ctx, } = req;

  // Layer 1 — the capability matrix. A tool that declares nothing is denied.
  const capabilities = getCommandCapabilities(tool,);
  const decision = evaluateCapabilities({
    tool,
    tags: capabilities?.tags,
    roleInChat: ctx.roleInChat,
    userRole: ctx.userRole,
  },);

  let verdict: ToolAuditVerdict = "allowed";
  let rationale = decision.reason;
  let escalationAttempt = false;

  try {
    if (!decision.allowed) {
      verdict = "denied";
      return { allowed: false, reason: decision.reason, };
    }

    // Layer 2 — the aux-LLM judge, for review-tier natural-language requests.
    if (decision.requiresReview && req.origin === "natural-language") {
      const judge = req.judge ?? judgeToolCall;
      const judgeVerdict = await judge({
        tool,
        args: req.args,
        content: req.content,
        role: ctx.roleInChat,
        config: ctx.config ?? ({} as Config),
        db,
        userId: ctx.userId,
        chatId: ctx.chatId,
      },);

      escalationAttempt = judgeVerdict.escalationAttempt;
      rationale = judgeVerdict.rationale;
      if (!judgeVerdict.approved) {
        verdict = "denied";
        return { allowed: false, reason: judgeVerdict.rationale, };
      }

      verdict = "reviewed";
    }

    // Layer 3 — the sandbox runs the handler.
    const outcome = await execute(req,);
    if (!outcome.allowed) { verdict = "denied"; }

    return outcome;
  } catch (error) {
    rationale = `${rationale} (tool failed: ${(error as Error).message})`;
    throw error;
  } finally {
    await recordToolCallAudit(db, {
      tool,
      chatId: ctx.chatId ?? "",
      userId: ctx.userId ?? "",
      verdict,
      rationale,
      escalationAttempt,
      requiredRole: getCommandRequirement(tool,) ?? null,
      tags: decision.tags,
      durationMs: Date.now() - startedAt,
    },);
  }
}
