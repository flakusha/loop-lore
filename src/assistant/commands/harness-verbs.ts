// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// `/orchestrate`, `/workflowz`, `/omp` - agent-harness verbs (TASK-harness-frontend-consolidation).
//
// epic-harness-integration section 2/10: these are thin verbs over the EXISTING
// workflow engine. Each resolves a config-declared workflow template, starts a
// normal session, and hands dispatch to the same `confirmAndDispatch` +
// session-store TTL path `/workflow` uses - no second runner and no new prompt
// vocabulary. Fan-out behaviour (orchestrate/workflowz pool-first + judge,
// omp evidence-not-truth) lives in the workflow YAML's steps and dispatch
// template, never in hand-rolled prompt strings here.

import type { AssistantWorkflowConfig, } from "../../config/sections/templates";
import { ChatParticipantRole, } from "../../db/enums";
import { getSession, startSession, } from "../workflow-session";
import { saveSession, } from "../workflow-session-store";
import { type CommandContext, type CommandResult, registerCommand, } from "./registry";
import { formatWorkflowPreview, } from "./workflow";

/** Workflow id a verb falls back to when the user names no workflow. */
const DEFAULT_WORKFLOW_BY_VERB: Record<string, string> = {
  orchestrate: "harness-orchestrate",
  workflowz: "harness-workflowz",
  omp: "harness-small-agent",
};

/** One verb's registration data. */
interface HarnessVerb {
  /** Slash command name (lowercase). */
  name: string;
  /** Usage line shown on bad input. */
  usage: string;
}

const VERBS: readonly HarnessVerb[] = [
  {
    name: "orchestrate",
    usage: "Usage: `/orchestrate [workflow] [goal...]` - fan a task out across the agent pool " +
      "(pool-first, judge the results, cite evidence).",
  },
  {
    name: "workflowz",
    usage: "Usage: `/workflowz [workflow] [goal...]` - run a multi-step harness workflow; " +
      "each step prompts in turn.",
  },
  {
    name: "omp",
    usage: "Usage: `/omp [goal...]` - drive a small coding agent (omp-backed workflow). " +
      "Evidence over assertion.",
  },
];

/**
 * Every workflow the config knows about, indexed by lowercased id AND name so
 * `/workflowz Harness-Code` resolves the same as `/workflowz harness-code`.
 * @param ctx - Command context
 * @returns Workflow templates keyed by lowercased id and display name
 */
function indexWorkflows(ctx: CommandContext,): Record<string, AssistantWorkflowConfig> {
  const workflows = Object.values(ctx.config?.templates?.workflows?.workflows ?? {},);
  const index: Record<string, AssistantWorkflowConfig> = {};
  for (const workflow of workflows) {
    index[workflow.id.toLowerCase()] = workflow;
    index[workflow.name.toLowerCase()] = workflow;
  }
  return index;
}

/**
 * Human list of the workflows this server's config declares, for `/verb list`.
 * @param index - Workflows indexed by id/name
 * @returns Markdown bullet list, or a notice when none are configured
 */
function formatWorkflowList(index: Record<string, AssistantWorkflowConfig>,): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const workflow of Object.values(index,)) {
    if (seen.has(workflow.id,)) { continue; }
    seen.add(workflow.id,);
    const desc = workflow.description ? ` - ${workflow.description}` : "";
    lines.push(`- \`${workflow.id}\`${desc}`,);
  }
  if (lines.length === 0) {
    return "No harness workflows are configured for this server.";
  }
  return `**Available workflows:**\n${lines.join("\n",)}`;
}

/**
 * Start a harness verb's workflow run and render its step preview.
 *
 * Reuses the `/workflow` session lifecycle verbatim: `startSession` plus the
 * store's write-through, so the 24h TTL and restart rehydration apply
 * unchanged. Step values then arrive as plain messages through the existing
 * dispatch hook, and `confirmAndDispatch` produces the envelope.
 * @param verb - The verb being invoked
 * @param args - Command args (`[workflow] [goal...]`)
 * @param ctx - Command context
 * @returns Preview to answer step-by-step, a workflow list, or a clear error
 */
async function startHarnessVerb(
  verb: HarnessVerb,
  args: string[],
  ctx: CommandContext,
): Promise<CommandResult> {
  const index = indexWorkflows(ctx,);
  if (Object.keys(index,).length === 0) {
    return {
      systemMessage: `**${verb.name}** is unavailable - no harness workflows are configured. ${verb.usage}`,
      handled: true,
    };
  }
  if ((args[0] ?? "").toLowerCase() === "list") {
    return { systemMessage: formatWorkflowList(index,), handled: true, };
  }
  const named = args[0];
  const workflow = named ? index[named.toLowerCase()] : index[DEFAULT_WORKFLOW_BY_VERB[verb.name] ?? ""];
  if (!workflow) {
    return {
      systemMessage: `**Unknown workflow:** \`${named ?? ""}\`.\n\n${formatWorkflowList(index,)}\n\n${verb.usage}`,
      handled: true,
    };
  }
  // Only one live run per chat: a new verb must not silently clobber another.
  const existing = getSession(ctx.chatId,);
  if (existing) {
    return {
      systemMessage: `A run is already active (**${existing.workflow.name}**). Finish it with ` +
        "`/workflow confirm`, or `/workflow cancel` first.",
      handled: true,
    };
  }
  const session = startSession(ctx.chatId, workflow,);
  if (ctx.db) { await saveSession(ctx.db, ctx.chatId, session,); }
  return {
    systemMessage: `**${workflow.name}** - answer each step in order:\n\n${formatWorkflowPreview(session,)}`,
    action: "workflow-start",
    actionPayload: { workflowId: workflow.id, },
    handled: true,
  };
}

for (const verb of VERBS) {
  registerCommand(verb.name, (args, ctx,) => startHarnessVerb(verb, args, ctx,), {
    requiredRole: ChatParticipantRole.Member,
  },);
}
