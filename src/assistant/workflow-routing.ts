// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Assistant → workflow → GM handoff routing (epic-assistant-gm-flows).
//
// One routing rule for chat and group-chat messages: slash command first,
// then workflow trigger match, then story-mode GM, else plain chat. Pure —
// the caller owns provider resolution, persistence, and rendering. Never
// returns undefined: unknown input falls through to "chat", never silence.

import type { AssistantWorkflowConfig, } from "../config/sections/templates";
import { SLASH_COMMAND, } from "../regex/intent";

/** Where a non-command message goes after routing */
export type RouteTarget =
  | { readonly kind: "command"; readonly name: string }
  | { readonly kind: "workflow"; readonly workflow: AssistantWorkflowConfig }
  | { readonly kind: "gm" }
  | { readonly kind: "chat" };

/** Inputs the router needs — no DB, no config access */
export interface RouteMessageOptions {
  message: string;
  /** Loaded workflow templates (values of config.workflows.workflows) */
  workflows: readonly AssistantWorkflowConfig[];
  /** Story mode routes unmatched messages to the GM service */
  isStoryMode: boolean;
}

/**
 * Look up a loaded workflow template by id.
 * @param workflows - Loaded workflow templates
 * @param id - Workflow id (e.g. "entity-character")
 * @returns The template, or undefined when unknown
 */
export function findWorkflowById(
  workflows: readonly AssistantWorkflowConfig[],
  id: string,
): AssistantWorkflowConfig | undefined {
  return workflows.find((w,) => w.id === id);
}

/**
 * Match a message against workflow trigger phrases (case-insensitive
 * substring). First template in load order wins.
 * @param message - Raw user message
 * @param workflows - Loaded workflow templates
 * @returns The matched template, or undefined
 */
export function matchWorkflowTrigger(
  message: string,
  workflows: readonly AssistantWorkflowConfig[],
): AssistantWorkflowConfig | undefined {
  const lower = message.toLowerCase();
  for (const workflow of workflows) {
    for (const trigger of workflow.triggers ?? []) {
      if (trigger !== "" && lower.includes(trigger.toLowerCase(),)) {
        return workflow;
      }
    }
  }
  return undefined;
}

/**
 * Route one chat message to its handler.
 * Precedence: slash command → workflow trigger → story GM → chat.
 * @param opts - Message, loaded workflows, story-mode flag
 * @returns Route target (always defined — unknown input routes to chat)
 */
export function routeAssistantMessage(opts: RouteMessageOptions,): RouteTarget {
  const slash = SLASH_COMMAND.exec(opts.message.trim(),);
  if (slash?.[1] !== undefined) {
    return { kind: "command", name: slash[1], };
  }
  const workflow = matchWorkflowTrigger(opts.message, opts.workflows,);
  if (workflow !== undefined) {
    return { kind: "workflow", workflow, };
  }
  if (opts.isStoryMode) {
    return { kind: "gm", };
  }
  return { kind: "chat", };
}

/**
 * Append GM shadow-note steering to an assembled workflow prompt.
 * Runner stays pure — steering is applied by the caller between
 * assemblePrompt and confirmAndDispatch.
 * @param prompt - Assembled workflow prompt
 * @param steering - Formatted shadow-note block (empty string = no-op)
 * @returns Prompt with steering appended, or unchanged when empty
 */
export function withShadowSteering(prompt: string, steering: string,): string {
  if (steering.trim() === "") { return prompt; }
  return `${prompt}\n\n${steering}`;
}
