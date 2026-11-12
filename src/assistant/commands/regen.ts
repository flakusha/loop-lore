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
import { assertNever, } from "../../utils";
import { runImprove, } from "./improve";
import { decideRegenRoute, } from "./regen-gate";
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
 * Core `/regen` logic. The smart-regen decision gate (a pure module — see
 * `regen-gate.ts`) chooses the route: an explicit action dispatches to the
 * underlying rewrite/improve runner, and — when `assistant.smartRegenGate` is
 * enabled — an unqualified regen resolves by message-size heuristic to a
 * plain re-roll or an alternate style instead of the usage menu.
 * @param args
 * @param ctx
 * @param deps
 * @returns regeneration result or usage notice
 */
export async function runRegenAction(args: string[], ctx: CommandContext, deps: RegenDeps,): Promise<CommandResult> {
  const target = lastAssistant(ctx,);
  const decision = decideRegenRoute({
    explicitAction: args[0],
    knownActions: actions.map((a,) => a.id),
    target: target === undefined ? undefined : { length: target.content.length, },
    gateEnabled: ctx.config?.assistant.smartRegenGate === true,
  },);

  switch (decision.decision) {
    case "menu": {
      const names = actions.map((a,) => a.id).join("|",);
      return { systemMessage: `${USAGE}\nAvailable: ${names}.`, handled: true, };
    }

    case "reroll":
    case "style": {
      if (!target) {
        return { systemMessage: "**No assistant message to regenerate.**", handled: true, };
      }

      const style = decision.decision === "style" ? decision.style : "clear";
      // runRewrite reads the style from the valve-resolved namedArgs and the
      // target text from positionalArgs — the raw-args flag form is legacy.
      return runRewrite(
        [target.content,],
        { ...ctx, namedArgs: { style, }, positionalArgs: [target.content,], },
        deps,
      );
    }

    case "action": {
      if (!target) {
        return { systemMessage: "**No assistant message to regenerate.**", handled: true, };
      }

      if (decision.action === "add-details") {
        return runImprove([target.content, "--level", "expand",], ctx,);
      }

      const style = decision.action === "more-concise" ? "concise" : "clear";
      return runRewrite(
        [target.content,],
        { ...ctx, namedArgs: { style, }, positionalArgs: [target.content,], },
        deps,
      );
    }

    default: {
      return assertNever(decision,);
    }
  }
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
}, { capabilities: ["read-chat", "network",], },);
