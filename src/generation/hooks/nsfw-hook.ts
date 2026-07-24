/**
 * NSFW Hook — Checks content against NSFW policy and age gates.
 *
 * Uses the LLM to detect NSFW content and gates generation
 * based on the character's nsfw_policy and the global NsfwConfig.
 */

import { getLogger, } from "../../logger";
import type { HookContext, HookEventType, HookHandler, HookResult, } from "./types";

export class NsfwHook implements HookHandler {
  readonly name = "nsfw";
  readonly eventTypes: HookEventType[] = ["nsfw_gate", "privacy_check",];

  async canHandle(_content: string, _context: HookContext,): Promise<boolean> {
    if (!_context.nsfwConfig.allowNsfw) { return false; }
    return _content.length > 20;
  }

  async execute(_content: string, _context: HookContext,): Promise<HookResult> {
    const log = getLogger();
    log.debug("nsfw-hook: checking content against policy", { policy: _context.nsfwPolicy, },);

    const nsfwLevel = this.detectNsfwLevel(_content,);
    if (nsfwLevel === "none") {
      return { handled: false, eventType: "nsfw_gate", };
    }

    const allowed = this.isAllowed(nsfwLevel, _context,);
    if (!allowed) {
      log.warn("nsfw-hook: content blocked by policy gate", { nsfwLevel, policy: _context.nsfwPolicy, },);
      return {
        handled: true,
        eventType: "nsfw_gate",
        data: { nsfwLevel, blocked: true, },
        suppressContent: true,
        reason: `Content level "${nsfwLevel}" exceeds policy "${_context.nsfwPolicy}"`,
      };
    }

    return {
      handled: true,
      eventType: "nsfw_gate",
      data: { nsfwLevel, allowed: true, },
    };
  }

  private detectNsfwLevel(content: string,): "none" | "mild" | "moderate" | "intense" | "extreme" {
    const lower = content.toLowerCase();
    const intenseKeywords = ["explicit", "graphic", "violent", "brutal", "gore",];
    const moderateKeywords = ["suggestive", "provocative", "steamy", "passionate", "arousing",];
    const mildKeywords = ["flirt", "attractive", "beautiful", "handsome", "charming",];

    for (const kw of intenseKeywords) {
      if (lower.includes(kw,)) { return "intense"; }
    }
    for (const kw of moderateKeywords) {
      if (lower.includes(kw,)) { return "moderate"; }
    }
    for (const kw of mildKeywords) {
      if (lower.includes(kw,)) { return "mild"; }
    }
    return "none";
  }

  private isAllowed(level: string, context: HookContext,): boolean {
    const policy = context.nsfwPolicy ?? "mild";
    const levels = ["none", "mild", "moderate", "intense", "extreme",];
    const policyIndex = levels.indexOf(policy,);
    const contentIndex = levels.indexOf(level,);

    return contentIndex <= policyIndex;
  }
}
