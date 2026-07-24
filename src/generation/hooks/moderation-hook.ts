/**
 * Moderation Hook — Flags content for moderation review.
 *
 * Detects content that should be flagged for moderation,
 * such as hate speech, harassment, or policy violations.
 */

import { getLogger, } from "../../logger";
import type { HookContext, HookEventType, HookHandler, HookResult, } from "./types";

export class ModerationHook implements HookHandler {
  readonly name = "moderation";
  readonly eventTypes: HookEventType[] = ["moderation_flag",];

  async canHandle(content: string, _context: HookContext,): Promise<boolean> {
    return content.length > 10;
  }

  async execute(content: string, _context: HookContext,): Promise<HookResult> {
    const log = getLogger();
    log.debug("moderation-hook: scanning content for flags", { contentLength: content.length, },);

    const flags = this.detectModerationFlags(content,);
    if (flags.length === 0) {
      return { handled: false, eventType: "moderation_flag", };
    }

    log.warn("moderation-hook: content flagged", { flags, },);

    return {
      handled: true,
      eventType: "moderation_flag",
      data: { flags, flagged: true, },
      suppressContent: flags.includes("severe",),
      reason: `Content flagged for moderation: ${flags.join(", ",)}`,
    };
  }

  private detectModerationFlags(content: string,): string[] {
    const flags: string[] = [];
    const lower = content.toLowerCase();

    const severeKeywords = ["hate", "violence", "threat", "abuse", "harass",];
    const moderateKeywords = ["insult", "offensive", "rude", "disrespect",];

    for (const kw of severeKeywords) {
      if (lower.includes(kw,)) { flags.push("severe",); }
    }
    for (const kw of moderateKeywords) {
      if (lower.includes(kw,)) { flags.push("moderate",); }
    }

    return flags;
  }
}
