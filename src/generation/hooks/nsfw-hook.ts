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
import { resolveSystemPrompt, } from "../../prompts";
import { jsonParseOr, } from "../../utils/safe-json";
import type { HookContext, HookEventType, HookHandler, HookResult, } from "./types";

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
    let nsfwLevel = this.detectNsfwLevel(_content,);

    // When configured, augment with an LLM rating classifier for content the
    // keyword pass missed. The nsfw prompt is config-driven (llm.yaml
    // `systemPrompts.nsfw`, default NSFW_POLICY_PROMPT).
    if (nsfwLevel === "none" && _context.nsfwConfig.useLlmClassifier) {
      const llmLevel = await this.detectWithLlm(_content, _context,);
      if (llmLevel !== "none") { nsfwLevel = llmLevel; }
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
    } catch (err) {
      getLogger().warn("nsfw-hook: failed to record audit log", { error: String(err,), },);
    }
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

  /**
   * LLM content-rating fallback. Calls the shared AUX runner with the
   * config-driven nsfw purpose prompt. Any failure degrades to "none" —
   * the hook must never block generation on an LLM error (graceful, like
   * every other aux classifier).
   *
   * @param content - User message content to classify
   * @param context - Hook context (carries config + db)
   * @returns The mapped NSFW level, or "none" on failure/sfw
   */
  private async detectWithLlm(
    content: string,
    context: HookContext,
  ): Promise<"none" | "mild" | "moderate" | "intense" | "extreme"> {
    try {
      const messages = [
        {
          role: "system" as const,
          content: resolveSystemPrompt(context.config.templates.llm, "nsfw",),
        },
        { role: "user" as const, content: content.slice(0, 500,), },
      ];
      const response = await this.callAuxFn("nsfw", context.config, context.db, messages, {
        userId: context.userId,
        chatId: context.chatId,
        temperature: 0.0,
        maxTokens: 50,
      },);
      if (!response) { return "none"; }

      const parsed = jsonParseOr<{ rating?: string }>(response.content, {},);
      const rating = parsed?.rating;
      switch (rating) {
        case "nsfw_mild":
          return "mild";
        case "nsfw_moderate":
          return "moderate";
        case "nsfw_intense":
          return "intense";
        case "nsfw_extreme":
          return "extreme";
        default:
          return "none"; // sfw or unparseable
      }
    } catch {
      getLogger()
        .child({ module: "nsfw-hook", },)
        .debug("nsfw-hook: LLM classifier failed, falling back to none",);
      return "none";
    }
  }

  private isAllowed(level: string, context: HookContext,): boolean {
    const policy = context.nsfwPolicy ?? "mild";
    const levels = ["none", "mild", "moderate", "intense", "extreme",];
    const policyIndex = levels.indexOf(policy,);
    const contentIndex = levels.indexOf(level,);

    return contentIndex <= policyIndex;
  }
}
