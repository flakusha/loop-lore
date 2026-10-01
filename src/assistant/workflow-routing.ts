// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Assistant → workflow → GM handoff routing (epic-assistant-gm-flows).
//
// One routing rule for chat and group-chat messages: slash command first,
// then workflow trigger match, then story-mode GM, else plain chat. Pure —
// the caller owns provider resolution, persistence, and rendering. Never
// returns undefined: unknown input falls through to "chat", never silence.

import type { AssistantWorkflowConfig, } from "../config/sections/templates";
import { INTENT_PATTERNS, SLASH_COMMAND, } from "../regex/intent";
import { safeRegexExec, } from "../regex/safe-exec";

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
 * Imperative-generation opener. The `INTENT_PATTERNS` regexes are unanchored
 * (`/make.*character/i`), so intent routing must only fire when the message
 * *starts* with a generation request — otherwise roleplay prose like "we
 * make our way toward the character" hijacks normal chat. A generation
 * request opens with a verb plus article ("create a …", "draw me a …") or
 * one of the article-less phrasings "new …", "I need …", "give me …".
 */
const GENERATION_REQUEST =
  /^(?:please\s+)?(?:(?:create|make|generate|design|craft|draw)\s+(?:me\s+)?(?:a|an|the|some|another|my)\b|new\b|i\s+need\b|give\s+me\b)/i;

/**
 * Match a message to a workflow by `INTENT_PATTERNS` taxonomy rather than by
 * literal trigger phrase (epic §7.4). Catches phrasings the trigger list
 * misses — "make me a character named Y" has no trigger substring but does
 * match the `generate`/`character` intent group.
 *
 * Only messages that *open* with an imperative generation request route
 * (see {@link GENERATION_REQUEST}) — prose that merely contains an intent
 * noun mid-sentence falls through to chat/GM. Only `generate` intents route
 * to workflows, and only workflows that declare matching `intent` metadata
 * participate. Highest-confidence intent group wins; ties keep the first
 * group declared in `INTENT_PATTERNS`.
 * @param message - Raw user message
 * @param workflows - Loaded workflow templates
 * @returns The matched template, or undefined
 */
export function matchWorkflowIntent(
  message: string,
  workflows: readonly AssistantWorkflowConfig[],
): AssistantWorkflowConfig | undefined {
  if (!GENERATION_REQUEST.test(message.trim(),)) { return undefined; }
  const routed = workflows.filter((w,) => w.intent?.type === "generate");
  if (routed.length === 0) { return undefined; }
  let best: { readonly target: string; readonly confidence: number } | undefined;
  for (const group of INTENT_PATTERNS) {
    if (group.intent !== "generate") { continue; }
    if (
      !group.patterns.some((p,) => safeRegexExec(p, message, `intent:${group.intent}:${group.target}`,) !== null)
    ) { continue; }
    if (best === undefined || group.confidence > best.confidence) {
      best = { target: group.target, confidence: group.confidence, };
    }
  }
  if (best === undefined) { return undefined; }
  return routed.find((w,) => w.intent?.target === best.target);
}

/**
 * Route one chat message to its handler.
 * Precedence: slash command → workflow trigger → workflow intent → story GM → chat.
 * @param opts - Message, loaded workflows, story-mode flag
 * @returns Route target (always defined — unknown input routes to chat)
 */
export function routeAssistantMessage(opts: RouteMessageOptions,): RouteTarget {
  const slash = SLASH_COMMAND.exec(opts.message.trim(),);
  if (slash?.[1] !== undefined) {
    return { kind: "command", name: slash[1], };
  }

  const workflow = matchWorkflowTrigger(opts.message, opts.workflows,) ??
    matchWorkflowIntent(opts.message, opts.workflows,);

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
