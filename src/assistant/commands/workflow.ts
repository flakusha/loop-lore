// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// `/workflow` — drive config-driven assistant workflows from chat.
//
// Subcommands: `status` (default), `cancel`, `confirm`. Step values arrive
// as plain messages while a run is active (see the dispatch hook in
// `src/routes/messages/command.ts`). Confirmation dispatches: entity
// workflows (`assistant-create` backend) feed the assembled prompt into
// `/create`'s generate → quality-gates → preview flow; other backends return
// the dispatch envelope for the caller to POST.

import { ChatParticipantRole, } from "../../db/enums";
import { resolveProvider, } from "../../generation/providers/registry";
import { jsonParseOr, } from "../../utils";
import {
  fetchUnrevealedShadowNotes,
  formatShadowSteering,
} from "../prompt/sections/gm-notes";
import { withShadowSteering, } from "../workflow-routing";
import {
  assemblePrompt,
  buildStep,
  confirmAndDispatch,
  confirmRun,
  previewSteps,
} from "../workflow-runner";
import {
  cancelSession,
  getSession,
  nextStepId,
  type WorkflowSession,
} from "../workflow-session";
import { runCreateGeneration, } from "./create";
import {
  type CommandContext,
  type CommandResult,
  registerCommand,
} from "./registry";

/**
 * Render the step preview for a freshly started run.
 * @param session - Active session
 * @returns Markdown preview with steps + recommendations
 */
export function formatWorkflowPreview(session: WorkflowSession,): string {
  const lines = [`**${session.workflow.name}** — answer each step in order:\n`,];
  for (const step of previewSteps(session.workflow,)) {
    const recs = step.recommendations.length > 0 ? ` (e.g. ${step.recommendations.join("; ",)})` : "";
    const opts = step.options !== undefined ? ` [${step.options.join(" | ",)}]` : "";
    lines.push(`- **${step.name}**: ${step.description ?? ""}${opts}${recs}\n`,);
  }
  lines.push("\nReply with the first step, or `/workflow cancel` to abort.",);
  return lines.join("",);
}

/**
 * Render run progress after a step fill.
 * @param session - Active session
 * @returns Markdown progress + next-step prompt or confirmation prompt
 */
export function formatWorkflowProgress(session: WorkflowSession,): string {
  const filled = Object.keys(session.run.values,).length;
  const total = session.workflow.steps.length;
  const next = nextStepId(session,);
  if (next === undefined) {
    return (
      `**${session.workflow.name}** — all ${total} steps filled.\n\n` +
      `${assemblePrompt(session.workflow, session.run,)}\n\n` +
      `Reply \`/workflow confirm\` to dispatch, or \`/workflow cancel\` to abort.`
    );
  }
  const step = session.workflow.steps.find((s,) => s.id === next)!;
  return `**${session.workflow.name}** — step ${filled + 1}/${total} saved. Next: **${step.name}**${
    step.description ? ` — ${step.description}` : ""
  }`;
}

/**
 * Fill the next unfilled step from a plain message.
 * @param session - Active session
 * @param value - Raw message content
 * @returns Progress message, or validation error text
 */
export function fillNextStep(session: WorkflowSession, value: string,): string {
  const next = nextStepId(session,);
  if (next === undefined) {
    return "All steps are filled — reply `/workflow confirm` to dispatch, or `/workflow cancel` to abort.";
  }
  try {
    buildStep(session.workflow, session.run, next, value,);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error,);
    return `**Step rejected:** ${msg}`;
  }
  return formatWorkflowProgress(session,);
}

/**
 * Confirm a fully-filled run and dispatch.
 * Entity workflows run `/create` generation (preview, never direct persist);
 * other backends return the dispatch envelope.
 * @param session - Active session (all steps must be filled)
 * @param ctx - Command context (db/config for steering + providers)
 * @returns Dispatch result carrying preview or envelope payload
 */
export async function confirmSession(
  session: WorkflowSession,
  ctx: CommandContext,
): Promise<CommandResult> {
  const missing = session.workflow.steps
    .filter((step,) => session.run.values[step.id] === undefined)
    .map((step,) => step.id);
  if (missing.length > 0) {
    return {
      systemMessage: `**Workflow incomplete** — still missing: ${missing.join(", ",)}.`,
      handled: true,
    };
  }
  confirmRun(session.run,);
  let prompt = assemblePrompt(session.workflow, session.run,);
  prompt = withShadowSteering(prompt, await loadShadowSteering(ctx,),);
  let dispatch;
  try {
    dispatch = confirmAndDispatch(session.workflow, session.run, prompt,);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error,);
    return { systemMessage: `**Dispatch failed:** ${msg}`, handled: true, };
  }
  if (dispatch.backend !== "assistant-create") {
    cancelSession(ctx.chatId,);
    return {
      systemMessage: `**${session.workflow.name}** dispatched to \`${dispatch.target}\`.`,
      action: "workflow-dispatch",
      actionPayload: { workflowId: session.workflow.id, ...dispatch, prompt, },
      handled: true,
    };
  }
  const token = dispatch.target.split(" ",)[1] ?? "";
  const { db, config, } = ctx;
  if (!db || !config) {
    return {
      systemMessage: "**Entity creation unavailable:** command context missing database/config.",
      handled: true,
    };
  }
  let complete: Parameters<typeof runCreateGeneration>[2];
  let model: string | undefined;
  try {
    const resolved = await resolveProvider({ config: config as never, db, userId: ctx.userId, },);
    complete = resolved.provider.complete.bind(resolved.provider,);
    model = resolved.resolvedModel;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error,);
    return { systemMessage: `**Entity creation unavailable:** ${msg}`, handled: true, };
  }
  const result = await runCreateGeneration([token, prompt,], ctx, complete, model,);
  if (result.action === "create-entity-preview") { cancelSession(ctx.chatId,); }
  return result;
}

/**
 * Load GM shadow-note steering for the chat (GM role only).
 * Non-GM chats get no steering — shadow notes must never leak.
 * @param ctx - Command context
 * @returns Formatted steering block, or empty string
 */
async function loadShadowSteering(ctx: CommandContext,): Promise<string> {
  const { db, } = ctx;
  if (!db) { return ""; }
  const chat = await db
    .selectFrom("chats",)
    .select("gm_config",)
    .where("id", "=", ctx.chatId,)
    .executeTakeFirst();
  const role = chat?.gm_config
    ? jsonParseOr<{ assistantRole?: string }>(chat.gm_config, {},).assistantRole
    : undefined;
  if (role !== "gm") { return ""; }
  return formatShadowSteering(await fetchUnrevealedShadowNotes(db, ctx.chatId,),);
}

registerCommand("workflow", async (args, ctx,): Promise<CommandResult> => {
  const sub = (args[0] ?? "status").toLowerCase();
  const session = getSession(ctx.chatId,);
  if (sub === "cancel") {
    const had = cancelSession(ctx.chatId,);
    return { systemMessage: had ? "**Workflow cancelled.**" : "No active workflow run in this chat.", handled: true, };
  }
  if (!session) {
    return {
      systemMessage:
        "No active workflow run in this chat. Send a message matching a workflow trigger (e.g. `minimax video`, `create a character`) to start one.",
      handled: true,
    };
  }
  if (sub === "confirm") { return confirmSession(session, ctx,); }
  return { systemMessage: formatWorkflowProgress(session,), handled: true, };
}, { requiredRole: ChatParticipantRole.Member, },);
