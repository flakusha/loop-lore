// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `POST /api/v1/agent/worktrees` — TTY-free spawn with sandbox caps.
 *
 * Uses `git worktree add` through Bun.spawn with stdin closed: no pinentry,
 * no prompts, no `giwt gpg-unlock` call. Worktrees live at
 * `tree/agent-<uuid>/` under the git toplevel and are registered in
 * `rsi_agent_worktrees` for the concurrency caps and the idle sweeper.
 */
import { Elysia, t, } from "elysia";
import { randomUUID, } from "node:crypto";
import { resolve, } from "node:path";
import {
  badRequestResponse,
  internalErrorResponse,
  jsonResponse,
} from "../../routes/http-utils";
import { safeJsonStringify, } from "../../utils";
import { requireAgentScope, } from "./auth";
import {
  checkWorktreeCapacity,
  MAX_WORKTREE_BYTES,
  measureDirectoryBytes,
} from "./sandbox";
import type { AgentRouteOpts, RemoveArgs, SpawnArgs, } from "./types";

/** Git ref / branch names we accept from an agent — no options or traversal. */
const REF_RE = /^(?!-)[A-Za-z0-9._/-]+$/;

/** A spawn failure with an HTTP status the caller can act on. */
export class AgentWorktreeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message,);
    this.name = "AgentWorktreeError";
  }
}

/** @param text - git stderr/stdout
 * @returns true when git stopped at pinentry (the agent must unlock itself) */
function isGpgBlock(text: string,): boolean {
  return /pinentry|gpg|signing failed/i.test(text,);
}

/** Default TTY-free spawn. Never touches GPG state. */
export async function gitWorktreeAdd({ cwd, branch, base, path, }: SpawnArgs,): Promise<void> {
  const args = ["worktree", "add", "-b", branch, path,];
  if (base) { args.push(base,); }
  const child = Bun.spawn({
    cmd: ["git", ...args,],
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  },);

  const out = await new Response(child.stdout,).text();
  const err = await new Response(child.stderr,).text();
  const code = await child.exited;
  if (code === 0) { return; }
  const detail = (err || out).trim();
  if (isGpgBlock(detail,)) {
    throw new AgentWorktreeError(
      "git requested GPG signing. Run `giwt gpg-unlock` in the agent's own session and retry.",
      503,
      "gpg_unlock_required",
    );
  }

  throw new AgentWorktreeError(detail || `git worktree add exited ${code}`, 409, "worktree_spawn_failed",);
}

/** Default TTY-free removal. */
export async function gitWorktreeRemove({ cwd, path, }: RemoveArgs,): Promise<void> {
  const child = Bun.spawn({
    cmd: ["git", "worktree", "remove", "--force", path,],
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  },);

  await new Response(child.stdout,).text();
  await new Response(child.stderr,).text();
  await child.exited;
}

/** @param body - JSON-ready envelope
 * @param init - Response init (status + headers)
 * @returns Response carrying the safe-stringified body. */
function jsonEnvelope(body: unknown, init: ResponseInit,): Response {
  const payload = safeJsonStringify(body,);
  return new Response(payload.ok ? payload.value : "{}", init,);
}

/** @param message
 * @returns 429 envelope for a sandbox-cap rejection. */
function capacityExceeded(message: string,): Response {
  return jsonEnvelope({ error: "capacity_exceeded", message, }, {
    status: 429,
    headers: { "content-type": "application/json", "Retry-After": "60", },
  },);
}

/** @param opts - database + injectable spawn/measure seams
 * @param prefix - mount prefix (`/api/v1` in production)
 * @returns Elysia plugin with the worktree spawn route. */
export function worktreeRoutes(opts: AgentRouteOpts, prefix = "/api",) {
  const root = opts.repoRoot ?? process.cwd();
  const spawn = opts.spawnWorktree ?? gitWorktreeAdd;
  const remove = opts.removeWorktree ?? gitWorktreeRemove;
  const measure = opts.measureDirectoryBytes ?? measureDirectoryBytes;

  return new Elysia({ name: "agent-worktree", },)
    .post(
      `${prefix}/agent/worktrees`,
      async (ctx: any,) => {
        const agent = ctx.agentToken as { id: string } | undefined;
        if (!agent) { return internalErrorResponse("Agent context missing",); }

        const { branch, base, } = ctx.body as { branch: string; base?: string };
        if (
          !REF_RE.test(branch,) || branch.includes("..",) ||
          (base !== undefined && (!REF_RE.test(base,) || base.includes("..",)))
        ) {
          return badRequestResponse("branch/base must be a plain git ref name",);
        }

        const capacity = await checkWorktreeCapacity(opts.database, agent.id,);
        if (!capacity.allowed) { return capacityExceeded(capacity.reason ?? "worktree limit reached",); }

        const id = randomUUID();
        const path = resolve(root, "tree", `agent-${id}`,);
        try {
          await spawn({ cwd: root, branch, base, path, },);
          const bytes = await measure(path,);
          if (bytes > MAX_WORKTREE_BYTES) {
            await remove({ cwd: root, path, },);
            return jsonEnvelope({ error: "worktree_too_large", message: "worktree exceeds 500MB", }, {
              status: 413,
              headers: { "content-type": "application/json", },
            },);
          }

          await opts.database.insertInto("rsi_agent_worktrees",).values({
            id,
            token_id: agent.id,
            branch,
            path,
            disk_bytes: bytes,
          },).execute();

          return jsonResponse({ data: { worktreeId: id, path, branch, }, }, 201,);
        } catch (error) {
          if (error instanceof AgentWorktreeError) {
            return jsonEnvelope({ error: error.code, message: error.message, }, {
              status: error.status,
              headers: { "content-type": "application/json", },
            },);
          }

          return internalErrorResponse(
            "worktree spawn failed",
            error instanceof Error ? { message: error.message, } : undefined,
          );
        }
      },
      {
        body: t.Object({
          branch: t.String({ minLength: 1, maxLength: 120, },),
          base: t.Optional(t.String({ minLength: 1, maxLength: 120, },),),
        },),
        response: t.Object({
          data: t.Object({
            worktreeId: t.String(),
            path: t.String(),
            branch: t.String(),
          },),
        },),
        beforeHandle: [requireAgentScope("agent:worktree", opts,),] as any,
        detail: {
          summary: "Spawn a TTY-free agent worktree",
          description:
            "Creates tree/agent-<uuid>/ with git worktree add (stdin closed), registers it for sandbox caps, and returns worktreeId/path/branch. Never invokes giwt gpg-unlock.",
          tags: ["Agent API", "Worktree",],
        },
      },
    );
}
