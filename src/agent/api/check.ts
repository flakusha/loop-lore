// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `POST /api/v1/agent/check` — run `bun run check` in an agent worktree
 * and stream gate-by-gate progress over SSE. Reuses the check runner's
 * stdout verdict lines (`PASS:` / `FAIL:` / `SKIP:` / `ADVISORY:`) and its
 * `.tmp/check-report.json` for the final summary.
 */
import { Elysia, t, } from "elysia";
import { join, } from "node:path";
import {
  badRequestResponse,
  internalErrorResponse,
  jsonError,
  notFoundResponse,
} from "../../routes/http-utils";
import { safeJsonStringify, } from "../../utils";
import { requireAgentScope, } from "./auth";
import type { AgentRouteOpts, CheckExecution, } from "./types";

/** Only a plain CSV of gate names reaches the child argv. */
const GATES_RE = /^[A-Za-z0-9 ,._-]+$/;

/** 10-minute default; a caller may raise it to 30 minutes. */
export const DEFAULT_CHECK_TIMEOUT_MS = 10 * 60 * 1000;
export const MAX_CHECK_TIMEOUT_MS = 30 * 60 * 1000;

/** Default runner — stdin closed, stdout piped into the SSE stream. */
export function runBunCheck({ cwd, gates, }: { cwd: string; gates: string | undefined },): CheckExecution {
  const args = ["run", "check",];
  if (gates) { args.push("--gates", gates,); }
  const child = Bun.spawn({
    cmd: ["bun", ...args,],
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  },);

  // Drain stderr so the pipe cannot fill and stall the child.
  void new Response(child.stderr,).text();
  return { stream: child.stdout, exited: child.exited, kill: () => child.kill(), };
}

interface GateEvent {
  type: "gate";
  gate: string;
  status: "pass" | "fail" | "skip" | "advisory";
  progress: number;
  output: string;
}

interface Summary {
  gates: number;
  passed: number;
  failed: number;
  durationMs: number;
  timedOut?: boolean;
}

function verdict(line: string,): { status: GateEvent["status"]; gate: string } | null {
  const match = /^(PASS|FAIL|SKIP|ADVISORY):\s*(.+)$/.exec(line.trim(),);
  if (!match) { return null; }
  const status = match[1] === "PASS"
    ? "pass"
    : match[1] === "FAIL"
    ? "fail"
    : match[1] === "SKIP"
    ? "skip"
    : "advisory";

  return { status, gate: match[2]!.trim(), };
}

/**
 * @param execution - runner seam (real Bun.spawn in production, fake in tests)
 * @param cwd - worktree path, where `.tmp/check-report.json` lands
 * @param timeoutMs - wall-clock budget before the child is killed
 * @returns text/event-stream Response with one event per gate + a final event
 */
function sseCheckResponse(execution: CheckExecution, cwd: string, timeoutMs: number,): Response {
  const encoder = new TextEncoder();
  const startMs = Date.now();
  let timedOut = false;

  const body = new ReadableStream<Uint8Array>({
    async start(controller,) {
      const send = (event: unknown,) => {
        const payload = safeJsonStringify(event,);
        controller.enqueue(encoder.encode(`data: ${payload.ok ? payload.value : "{}"}\n\n`,),);
      };

      const timer = setTimeout(() => {
        timedOut = true;
        execution.kill();
      }, timeoutMs,);

      const seen = new Map<string, GateEvent["status"]>();
      try {
        const reader = execution.stream.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
          while (true) {
            const { done, value, } = await reader.read();
            if (done) { break; }
            buffer += decoder.decode(value, { stream: true, },);
            const lines = buffer.split("\n",);
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const v = verdict(line,);
              if (!v || seen.has(v.gate,)) { continue; }
              seen.set(v.gate, v.status,);
              // ponytail: progress is monotonic but not time-weighted — the
              // runner prints no gate count until its final summary. Swap in
              // real fractions if per-gate timing is ever needed.
              const event: GateEvent = {
                type: "gate",
                gate: v.gate,
                status: v.status,
                progress: Math.min(95, seen.size * 5,),
                output: line,
              };

              send(event,);
            }
          }
        } finally {
          reader.releaseLock();
        }

        const exitCode = await execution.exited;
        let summary: Summary | undefined;
        try {
          const report = await Bun.file(join(cwd, ".tmp", "check-report.json",),).json() as {
            summary?: { total?: number; passed?: number; failed?: number; durationMs?: number };
          };

          if (report.summary) {
            summary = {
              gates: report.summary.total ?? 0,
              passed: report.summary.passed ?? 0,
              failed: report.summary.failed ?? 0,
              durationMs: report.summary.durationMs ?? Date.now() - startMs,
            };
          }
        } catch {
          // no report (stubbed runner / early kill) — derive from the stream
        }

        if (!summary) {
          const statuses = [...seen.values(),];
          summary = {
            gates: seen.size,
            passed: statuses.filter((s,) => s === "pass").length,
            failed: statuses.filter((s,) => s === "fail").length,
            durationMs: Date.now() - startMs,
          };
        }

        if (timedOut) { summary.timedOut = true; }
        send({ type: "final", status: exitCode === 0 ? "pass" : "fail", summary, },);
      } catch (error) {
        send({
          type: "final",
          status: "fail",
          summary: {
            gates: 0,
            passed: 0,
            failed: 1,
            durationMs: Date.now() - startMs,
            timedOut,
          },
          error: error instanceof Error ? error.message : String(error,),
        },);
      } finally {
        clearTimeout(timer,);
        controller.close();
      }
    },
  },);

  return new Response(body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  },);
}

/** @param opts - database + runner seam
 * @param prefix - mount prefix (`/api/v1` in production)
 * @returns Elysia plugin with the check-stream route. */
export function checkRoutes(opts: AgentRouteOpts, prefix = "/api",) {
  return new Elysia({ name: "agent-check", },)
    .post(
      `${prefix}/agent/check`,
      async (ctx: any,) => {
        const agent = ctx.agentToken as { id: string } | undefined;
        if (!agent) { return internalErrorResponse("Agent context missing",); }

        const { worktreeId, gates, timeoutMs, } = ctx.body as {
          worktreeId: string;
          gates?: string;
          timeoutMs?: number;
        };

        if (gates !== undefined && (gates.length > 500 || !GATES_RE.test(gates,))) {
          return badRequestResponse("gates must be a plain comma-separated gate list",);
        }

        // Token-scoped: a worktreeId is only resolvable by its owner, so a
        // valid id from another token is indistinguishable from unknown (404).
        const row = await opts.database
          .selectFrom("rsi_agent_worktrees",)
          .select(["path",],)
          .where("id", "=", worktreeId,)
          .where("token_id", "=", agent.id,)
          .where("removed_at", "is", null,)
          .executeTakeFirst();

        if (!row) { return notFoundResponse("Unknown agent worktree",); }

        const budget = Math.min(
          Math.max(timeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS, 1000,),
          MAX_CHECK_TIMEOUT_MS,
        );

        const run = opts.runCheck ?? runBunCheck;
        let execution: CheckExecution;
        try {
          execution = await run({ cwd: row.path, gates, },);
        } catch (error) {
          return jsonError({
            message: error instanceof Error ? error.message : "check failed to start",
            status: 500,
          },);
        }

        return sseCheckResponse(execution, row.path, budget,);
      },
      {
        body: t.Object({
          worktreeId: t.String({ minLength: 1, },),
          gates: t.Optional(t.String({ maxLength: 500, },),),
          timeoutMs: t.Optional(t.Integer({ minimum: 1000, maximum: MAX_CHECK_TIMEOUT_MS, },),),
        },),
        beforeHandle: [requireAgentScope("agent:check", opts,),] as any,
        detail: {
          summary: "Stream bun run check over SSE",
          description:
            "Runs `bun run check --gates <csv>` in one of the caller token's agent worktrees. Emits one gate event per PASS/FAIL/SKIP/ADVISORY line and a final event whose status matches the process exit code. 10-minute default timeout, configurable.",
          tags: ["Agent API", "Check", "SSE",],
        },
      },
    );
}
