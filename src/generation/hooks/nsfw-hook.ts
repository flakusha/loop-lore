// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Hook — Checks content against NSFW policy and age gates.
 *
 * Uses keyword detection to classify content NSFW level and gates
 * generation based on the character's nsfw_policy and the global NsfwConfig.
 * Writes moderation audit logs for blocked content.
 */

import { callAux, } from "../../aux-pipeline";
import { getLogger, } from "../../logger";
import { NsfwModerationService, } from "../../nsfw/moderation-service";
import {
  computeEffectiveRating,
  isRatingAllowed,
  NSFW_RATING_SEVERITY,
  NSFWContentRating,
} from "../../schemas";
import type { HookContext, HookEventType, HookHandler, HookResult, } from "./types";

import { detectNsfwLevel, detectNsfwWithLlm, } from "./nsfw-classifier";

export interface NsfwHookDeps {
  /** LLM rating runner; injectable for tests. Defaults to the AUX pipeline. */
  callAux: typeof callAux;
}

export class NsfwHook implements HookHandler {
  readonly name = "nsfw";

  readonly eventTypes: HookEventType[] = ["nsfw_gate", "privacy_check",];

  private modService: NsfwModerationService | null = null;

  private readonly callAuxFn: typeof callAux;

  constructor(deps?: Partial<NsfwHookDeps>,) {
    this.callAuxFn = deps?.callAux ?? callAux;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- GenerationHook.canHandle interface requires Promise<boolean>
  async canHandle(_content: string, _context: HookContext,): Promise<boolean> {
    if (!_context.nsfwConfig.allowNsfw) { return false; }
    return _content.length > 20;
  }

  async execute(_content: string, _context: HookContext,): Promise<HookResult> {
    const log = getLogger();
    log.debug("nsfw-hook: checking content against policy", { policy: _context.nsfwPolicy, },);

    // Check effective NSFW setting (per-chat > per-world > user pref)
    // Gracefully fall back if DB not available (e.g. in tests)
    try {
      const svc = this.getModService(_context,);
      const effective = await svc.getEffectiveNsfw(_context.chatId, _context.userId,);
      if (!effective.enabled) {
        log.debug("nsfw-hook: NSFW disabled by override", { source: effective.source, },);
        return {
          handled: true,
          eventType: "nsfw_gate",
          data: { nsfwLevel: "blocked_by_override", blocked: true, source: effective.source, },
          suppressContent: true,
          reason: `NSFW disabled by ${effective.source}`,
        };
      }
    } catch {
      // DB not available or query failed — fall through to policy check
    }

    // Keyword detection is deterministic and fast; run it first.
    let nsfwLevel = detectNsfwLevel(_content,);

    // LLM classifier is the safety filter for the extreme tier the keyword pass
    // cannot name; let it escalate, keeping the more severe of the two ratings.
    if (_context.nsfwConfig.useLlmClassifier) {
      const llmLevel = await detectNsfwWithLlm(_content, _context, this.callAuxFn,);
      if (NSFW_RATING_SEVERITY[this.levelToRating(llmLevel,)] > NSFW_RATING_SEVERITY[this.levelToRating(nsfwLevel,)]) {
        nsfwLevel = llmLevel;
      }
    }

    if (nsfwLevel === "none") {
      return { handled: false, eventType: "nsfw_gate", };
    }

    const allowed = this.isAllowed(nsfwLevel, _context,);

    // Write audit log for NSFW content detection
    await this.recordAudit(_context, nsfwLevel, allowed,);

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

  private getModService(context: HookContext,): NsfwModerationService {
    if (!this.modService) {
      this.modService = new NsfwModerationService(context.db,);
    }
    return this.modService;
  }

  private async recordAudit(context: HookContext, nsfwLevel: string, allowed: boolean,): Promise<void> {
    try {
      const svc = this.getModService(context,);
      await svc.recordAction({
        actionType: allowed ? "nsfw_detected" : "nsfw_blocked",
        targetUserId: context.actorId,
        performedBy: "system",
        reason: `NSFW ${allowed ? "detected" : "blocked"}: level "${nsfwLevel}" ${
          allowed ? "within" : "exceeds"
        } policy "${context.nsfwPolicy}"`,
        scope: "chat",
        scopeId: context.chatId,
      },);
    } catch (error) {
      getLogger().warn("nsfw-hook: failed to record audit log", { error: String(error,), },);
    }
  }

  /** Map hook-detected level string to NSFWContentRating enum.
   *  Accepts both short names ("extreme") and full enum values ("nsfw_extreme"). */
  private levelToRating(level: string,): NSFWContentRating {
    switch (level) {
      case "extreme":
      case "nsfw_extreme": {
        return NSFWContentRating.NSFW_EXTREME;
      }
      case "intense":
      case "nsfw_intense": {
        return NSFWContentRating.NSFW_INTENSE;
      }
      case "moderate":
      case "nsfw_moderate": {
        return NSFWContentRating.NSFW_MODERATE;
      }
      case "mild":
      case "nsfw_mild": {
        return NSFWContentRating.NSFW_MILD;
      }
      default: {
        return NSFWContentRating.SFW;
      }
    }
  }

  /**
   * Compute effective content limit using the NSFWRatingEnforcement contract.
   * effective_limit = min(actor_rating, user_max_rating, chat_setting).
   * Falls back to nsfwPolicy-based limit when contract fields are absent.
   */
  private computeEffectiveLimit(context: HookContext,): NSFWContentRating {
    const actorRating = context.actorContentRating
      ? this.levelToRating(context.actorContentRating,)
      : undefined;
    const userRating = context.maxUserRating
      ? this.levelToRating(context.maxUserRating,)
      : undefined;
    const chatRating = context.chatNsfwOverride
      ? this.levelToRating(context.chatNsfwOverride,)
      : undefined;

    // When all three contract fields are present, use the contract
    if (actorRating !== undefined && userRating !== undefined && chatRating !== undefined) {
      return computeEffectiveRating(actorRating, userRating, chatRating,);
    }

    // Fallback: use nsfwPolicy (legacy path)
    const policy = context.nsfwPolicy ?? "mild";
    return this.levelToRating(policy,);
  }

  private isAllowed(level: string, context: HookContext,): boolean {
    const contentRating = this.levelToRating(level,);
    const effectiveLimit = this.computeEffectiveLimit(context,);
    return isRatingAllowed(contentRating, effectiveLimit,);
  }
}
