// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/nsfw/capability-gate.ts — NSFW capability gate
//
// Actor-pair capability boundary for NSFW game mechanics (intimacy,
// encounters, seduction, ...). Thin throwing wrapper: composes the
// middleware request gate (`checkNsfwWithConsent`), the intimacy
// threshold check (`checkIntimacyForNsfw`), and the rating enforcement
// helpers (`computeEffectiveRating` / `isRatingAllowed`) — it owns no
// gate logic of its own. Any mutation path that bypasses this gate and
// mutates NSFW state is a contract violation (TASK-033/036).

import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { checkIntimacyForNsfw, } from "../middleware/nsfw-gate/access";
import { checkNsfwWithConsent, } from "../middleware/nsfw-gate/consent";
import {
  computeEffectiveRating,
  type ConsentState,
  isActionConsented,
  isRatingAllowed,
  NSFWContentRating,
  type NSFWRatingEnforcement,
} from "../schemas";

// ── Error type ───────────────────────────────────────────────

/** Why the capability gate blocked an operation. */
export type CapabilityBlockReason =
  | "access_denied"
  | "consent_not_given"
  | "action_not_consented"
  | "rating_blocked"
  | "intimacy_insufficient";

/** Thrown when an NSFW capability is not available for an actor pair. */
export class CapabilityBlockedError extends Error {
  /** Machine-readable block reason — branch on this, not on the message. */
  readonly reason: CapabilityBlockReason;

  constructor(reason: CapabilityBlockReason, message: string,) {
    super(message,);
    this.name = "CapabilityBlockedError";
    this.reason = reason;
  }
}

// ── Gate ─────────────────────────────────────────────────────

/** Default consent-scoped action asserted by the gate. */
const DEFAULT_CONSENT_ACTION = "nsfw_encounter";

/** */
export interface AssertNsfwCapabilityArgs {
  database: Kysely<DB>;
  config: Config;
  /** Requesting human user (null = anonymous — middleware applies its rules). */
  userId: string | null;
  chatId: string;
  /** Actor attempting the interaction. */
  actorId: string;
  /** Actor being interacted with. */
  targetActorId: string;
  /** Optional world scope for the intimacy lookup. */
  worldId?: string | null;
  /** Rating of the content about to be produced. Defaults to the actor's rating. */
  contentRating?: NSFWContentRating;
  /** Extra rating ceilings folded into the effective limit. */
  ratingLimits?: NSFWContentRating[];
  /** Consent-scoped action to assert. Defaults to "nsfw_encounter". */
  consentAction?: string;
}

/** Gate verdict details, returned on success for caller reuse. */
export interface NsfwCapabilityGrant {
  enforcement: NSFWRatingEnforcement;
  consent: ConsentState;
  intimacy: { sufficient: boolean; score: number; threshold: number };
}

/**
 * Assert that an NSFW capability may proceed for an actor pair.
 *
 * Sequence: middleware request gate (auth → base → participants → consent)
 * → consent-state invariants → rating vs effective limit → intimacy
 * threshold. Returns the underlying verdicts so callers avoid re-querying.
 * @param args - See {@link AssertNsfwCapabilityArgs}.
 * @returns Grant details (enforcement, consent, intimacy).
 * @throws {CapabilityBlockedError} `access_denied` (middleware verdict, reason passthrough),
 * `consent_not_given`, `action_not_consented`, `rating_blocked`,
 * or `intimacy_insufficient`.
 */
export async function assertNsfwCapability(
  args: AssertNsfwCapabilityArgs,
): Promise<NsfwCapabilityGrant> {
  const gate = await checkNsfwWithConsent({
    database: args.database,
    config: args.config,
    userId: args.userId,
    chatId: args.chatId,
    actorId: args.actorId,
  },);
  if (!gate.allowed) {
    throw new CapabilityBlockedError(
      "access_denied",
      `NSFW capability blocked: ${gate.reason ?? "unknown"}`,
    );
  }

  if (args.config.nsfw.consentRequired) {
    // The middleware verdict already denies missing/revoked consent; these
    // are the throwing conversion + scope refinement on the granted state.
    // (The returned ConsentState models consent as always-required, so the
    // config flag — not the state — decides whether consent applies.)
    if (!gate.consent.consent_given) {
      throw new CapabilityBlockedError(
        "consent_not_given",
        "NSFW capability blocked: consent has not been given",
      );
    }
    const action = args.consentAction ?? DEFAULT_CONSENT_ACTION;
    if (!isActionConsented(gate.consent, action,)) {
      throw new CapabilityBlockedError(
        "action_not_consented",
        `NSFW capability blocked: action "${action}" is outside the consent scope`,
      );
    }
  }

  const effectiveLimit = computeEffectiveRating(
    gate.enforcement.effective_limit,
    ...(args.ratingLimits ?? []),
  );
  const contentRating = args.contentRating ?? gate.enforcement.character_rating;
  if (!isRatingAllowed(contentRating, effectiveLimit,)) {
    throw new CapabilityBlockedError(
      "rating_blocked",
      `NSFW capability blocked: content rating "${contentRating}" exceeds effective limit "${effectiveLimit}"`,
    );
  }

  const intimacy = await checkIntimacyForNsfw(
    args.database,
    args.actorId,
    args.targetActorId,
    args.worldId ?? null,
  );
  if (!intimacy.sufficient) {
    throw new CapabilityBlockedError(
      "intimacy_insufficient",
      `NSFW capability blocked: intimacy score ${intimacy.score} below threshold ${intimacy.threshold}`,
    );
  }

  return { enforcement: gate.enforcement, consent: gate.consent, intimacy, };
}
