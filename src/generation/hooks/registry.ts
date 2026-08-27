// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Hook Registry — Registers and chains hook handlers.
 *
 * Hooks run in registration order. Each hook's `canHandle`
 * determines if it processes the content. All hooks that
 * handle the content produce results; none short-circuit.
 */

import { getLogger, } from "../../logger";
import { EmotionHook, } from "./emotion-hook";
import { ModerationHook, } from "./moderation-hook";
import { MoodHook, } from "./mood-hook";
import { NsfwHook, type NsfwHookDeps, } from "./nsfw-hook";
import type { HookChainOptions, HookChainResult, HookHandler, HookResult, } from "./types";

const registeredHooks: HookHandler[] = [];

export function registerHook(hook: HookHandler,): void {
  registeredHooks.push(hook,);
}

export function clearHooks(): void {
  registeredHooks.length = 0;
}

export function getRegisteredHooks(): readonly HookHandler[] {
  return registeredHooks;
}

export async function runHookChain(options: HookChainOptions,): Promise<HookChainResult> {
  const log = getLogger();
  const results: HookResult[] = [];
  let suppressedContent = false;

  for (const hook of registeredHooks) {
    // If context specifies targeted eventTypes, skip hooks that don't match
    if (options.context.eventTypes && options.context.eventTypes.length > 0) {
      const hookEvents = new Set(hook.eventTypes,);
      const targeted = options.context.eventTypes.some((et,) => hookEvents.has(et,));
      if (!targeted) { continue; }
    }

    const canHandle = await hook.canHandle(options.context.content, options.context,);
    if (!canHandle) { continue; }

    log.debug("hook-chain: executing hook", { hook: hook.name, },);

    const result = await hook.execute(options.context.content, options.context,);
    results.push(result,);

    if (result.handled && result.suppressContent) {
      suppressedContent = true;
    }
  }

  const allowed = !suppressedContent;
  const events: HookResult[] = [];
  for (const r of results) { if (r.handled) { events.push(r,); } }

  return { allowed, results, suppressedContent, events, };
}

/**
 * Initialize default hooks for the generation pipeline.
 * @param nsfwDeps Optional NsfwHook deps (e.g. injected moderation service
 * or LLM runner); forwarded to the default NsfwHook instance.
 */
export function initDefaultHooks(nsfwDeps?: Partial<NsfwHookDeps>,): void {
  clearHooks();
  registerHook(new MoodHook(),);
  registerHook(new EmotionHook(),);
  registerHook(new NsfwHook(nsfwDeps,),);
  registerHook(new ModerationHook(),);
}
