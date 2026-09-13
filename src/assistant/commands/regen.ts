// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/assistant/commands/regen.ts
//
// /regen — guided-regen menu for assistant messages (Try Again / Add Details /
// More Concise). First consumer of registry-declared message actions: each
// action maps to an existing rewrite/improve style, executed against the last
// assistant message.

import { resolveProvider, } from "../../generation/providers/registry";
import type { GenerateRequest, } from "../../generation/providers/types";
import { runImprove, } from "./improve";
import { type CommandContext, type CommandResult, registerCommand, } from "./registry";
import { runRewrite, } from "./rewrite";

const USAGE = "Usage: /regen <try-again|add-details|more-concise> — regenerate the last assistant message.";

/** A declared message action: stable id plus display metadata. */
export interface MessageActionDef {
  id: string;
  label: string;
  description: string;
}

/** Deps shape for /regen — passed through to the underlying runners. */
export interface RegenDeps {
  complete?: (req: GenerateRequest,) => Promise<{ content: string }>;
  model?: string;
}

const actions: MessageActionDef[] = [
  { id: "try-again", label: "Try Again", description: "Rewrite the last reply for clarity.", },
  { id: "add-details", label: "Add Details", description: "Expand the last reply with more detail.", },
  { id: "more-concise", label: "More Concise", description: "Shorten the last reply.", },
];

/**
 * List the declared guided-regen message actions.
 * @returns action defs in menu order
 */
export function listMessageActions(): MessageActionDef[] {
  return [...actions,];
}

/**
 * Find the last assistant/character message in context.
 * @param ctx
 * @returns message or undefined when none exists
 */
function lastAssistant(ctx: CommandContext,): { id: string; content: string } | undefined {
  const messages = ctx.messages ?? [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m !== undefined && (m.role === "assistant" || m.role === "character")) {
      return { id: m.id, content: m.content, };
    }
  }
  return undefined;
}

/**
 * Core `/regen` logic. Dispatches the named action to the underlying
 * rewrite/improve runner against the last assistant message.
 * @param args
 * @param ctx
 * @param deps
 * @returns regeneration result or usage notice
 */
export async function runRegenAction(args: string[], ctx: CommandContext, deps: RegenDeps,): Promise<CommandResult> {
  const id = args[0];
  const target = lastAssistant(ctx,);
  if (id === undefined || (id !== "try-again" && id !== "add-details" && id !== "more-concise")) {
    const names = actions.map((a,) => a.id).join("|",);
    return { systemMessage: `${USAGE}\nAvailable: ${names}.`, handled: true, };
  }
  if (!target) {
    return { systemMessage: "**No assistant message to regenerate.**", handled: true, };
  }
  if (id === "add-details") {
    return runImprove([target.content, "--level", "expand",], ctx,);
  }
  const style = id === "more-concise" ? "concise" : "clear";
  return runRewrite(["--style", style, target.content,], ctx, deps,);
}

registerCommand("regen", async (args, ctx,): Promise<CommandResult> => {
  const { config, db, } = ctx;
  if (!db || !config) {
    return runRegenAction(args, ctx, {},);
  }
  try {
    const resolved = await resolveProvider({ config, userId: ctx.userId, db, },);
    return runRegenAction(args, ctx, {
      complete: (req,) => resolved.provider.complete(req,),
      model: resolved.resolvedModel,
    },);
  } catch {
    return runRegenAction(args, ctx, {},);
  }
},);
