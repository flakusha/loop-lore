// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unified async request-context pipeline for NSFW gating.
 *
 * One choke point composing the independent checks — base access (config +
 * age + moderation state), participant weakest link, consent ledger, rating
 * enforcement — with fail-fast ordering (cheapest decisive stage first) and
 * intra-request batching (participant fan-out costs two queries total).
 *
 * `skip` exists for related server-side backends that need a subset of the
 * gate: user-settings provisioning (`{ participants: true, consent: true }`),
 * headers-only prechecks (`{ participants: true, consent: true, enforcement: true }`).
 * Skip flags are a server-side allowlist per caller — NEVER accept them from
 * client input (query params, headers, body); that would be a gate bypass.
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db";
import { getLogger, } from "../../logger";
import type { NSFWRatingEnforcement, } from "../../schemas/nsfw-rating";
import { getChatParticipantUserIds, } from "./access";
import {
  evaluateNsfwBase,
  type GateInputs,
  loadGateInputs,
} from "./base-eval";
import { getLatestConsent, hasActiveConsent, } from "./consent-ledger";

/**
 * Stages to omit. Every flag defaults to false (full gate). Each field
 * documents which server-side backend the subset serves.
 */
export interface RequestContextSkip {
  /** Omit banned/blocked denial — backends that read, not enforce, moderation state. */
  moderation?: boolean;
  /** Omit participant fan-out — single-user surfaces (own settings, headers). */
  participants?: boolean;
  /** Omit consent ledger — non-encounter backends (provisioning, headers). */
  consent?: boolean;
  /** Omit rating-ceiling object — callers needing only the verdict. */
  enforcement?: boolean;
}

/**
 * @param database
 * @param config
 * @param userId Requesting user; null short-circuits to `auth_required`.
 * @param chatId Chat scope for participant + consent stages.
 * @param actorId Actor for the enforcement stage.
 * @param skip Server-side stage allowlist; never client input.
 * @param buildEnforcement Rating-ceiling builder (lives with the consent
 *   gate to avoid an import cycle); skipped when `skip.enforcement`.
 */
export interface RequestContextArgs {
  database: Kysely<DB>;
  config: Config;
  userId: string | null;
  chatId: string;
  actorId: string;
  skip?: RequestContextSkip;
  buildEnforcement?: (stage: { actorId: string; userId: string; chatId: string },) => Promise<NSFWRatingEnforcement>;
}

/** Consent-ledger verdict for the requesting user in this chat. */
export type RequestConsentState = "not_required" | "granted" | "required" | "revoked";

/** Resolved gate verdict with per-stage detail for logging/telemetry. */
export interface RequestContext {
  /** Overall verdict — false at the first failing non-skipped stage. */
  allowed: boolean;
  /** Machine-readable denial reason (absent when allowed). */
  reason?: string;
  /** Base stage (config + moderation state + age gate + min age). */
  base: { allowed: boolean; reason?: string };
  /** Failing co-participant when the weakest-link stage denies. */
  participantDenial?: { userId: string; reason: string };
  /** Consent-ledger verdict (`not_required` when skipped or disabled). */
  consent: RequestConsentState;
  /** True only when the ledger holds an active grant (drives the consent-state object). */
  consentGranted: boolean;
  /** Rating ceiling (absent when skipped, anonymous, or no builder). */
  enforcement?: NSFWRatingEnforcement;
}
/**
 * Resolve the full (or skipped-subset) gate for one request.
 *
 * Order: auth → base → participants → consent → enforcement. Each stage
 * runs only when all previous stages passed, so the common deny (bad actor,
 * disabled toggle) costs a single batched read.
 * @param args
 */
export async function resolveRequestContext(args: RequestContextArgs,): Promise<RequestContext> {
  const { database, config, userId, chatId, actorId, skip, } = args;
  const log = getLogger().child({ module: "nsfw-request-context", },);

  // (no local state — every stage reads through to its source of truth)

  if (!userId) {
    return {
      allowed: false,
      reason: "auth_required",
      base: { allowed: false, reason: "auth_required", },
      consent: "not_required",
      consentGranted: false,
    };
  }

  // Base + participants share one batched load: requester inputs come from
  // the same two queries as the participant fan-out when both stages run.
  const participantIds = skip?.participants ? [] : await getChatParticipantUserIds(database, chatId,);
  const inputs = await loadGateInputs(database, [userId, ...participantIds,],);

  const base = evaluateNsfwBase(config.nsfw, inputs.get(userId,), {
    ignoreModeration: skip?.moderation,
  },);
  if (!base.allowed) {
    return { allowed: false, reason: base.reason, base, consent: "not_required", consentGranted: false, };
  }

  if (!skip?.participants) {
    const blocked = findBlockedParticipantFrom(config.nsfw, inputs, participantIds, userId,);
    if (blocked) {
      const reason = `participant_blocked:${blocked.reason}`;
      log.info("request-context: participant blocked", {
        chatId,
        userId,
        participantId: blocked.userId,
        reason: blocked.reason,
      },);
      return {
        allowed: false,
        reason,
        base,
        participantDenial: blocked,
        consent: "not_required",
        consentGranted: false,
      };
    }
  }

  let consent: RequestConsentState = "not_required";
  if (!skip?.consent && config.nsfw.consentRequired) {
    const persisted = await getLatestConsent(database, chatId, userId,);
    if (!hasActiveConsent(persisted,)) {
      consent = persisted ? "revoked" : "required";
      log.info("request-context: consent not granted", { chatId, userId, consent, },);
      return {
        allowed: false,
        reason: persisted ? "consent_revoked" : "consent_required",
        base,
        consent,
        consentGranted: false,
      };
    }
    consent = "granted";
  }

  const context: RequestContext = { allowed: true, base, consent, consentGranted: consent === "granted", };
  if (!skip?.enforcement && args.buildEnforcement) {
    context.enforcement = await args.buildEnforcement({ actorId, userId, chatId, },);
  }
  return context;
}

/**
 * Weakest-link over pre-loaded inputs — avoids re-querying what the
 * pipeline already fetched for the base stage.
 * @param gateConfig
 * @param gateConfig.allowNsfw
 * @param gateConfig.nsfwMinAge
 * @param inputs
 * @param participantIds
 * @param excludeUserId
 */
function findBlockedParticipantFrom(
  gateConfig: { allowNsfw: boolean; nsfwMinAge: number },
  inputs: Map<string, GateInputs>,
  participantIds: string[],
  excludeUserId: string,
): { userId: string; reason: string } | null {
  const others = participantIds.filter((id,) => id !== excludeUserId);
  if (others.length === 0) {
    return null;
  }
  for (const id of others) {
    const decision = evaluateNsfwBase(gateConfig, inputs.get(id,),);
    if (!decision.allowed) {
      return { userId: id, reason: decision.reason ?? "unknown", };
    }
  }
  return null;
}
