// src/schemas/index.ts — Shared Schema Barrel Export
//
// Re-exports all shared schemas for cross-system use.
// Import from here: `import { ReputationScore, ConsentState, NSFWContentRating } from "../schemas"`

export {
  type ReputationScore,
  type ReputationModifier,
  type ReputationTier,
  type ReputationSource,
  REPUTATION_TIERS,
  REPUTATION_TIER_ORDER,
  getReputationTier,
  clampReputation,
  createReputationScore,
  applyReputationChange,
  applyReputationDecay,
} from "./reputation";

export {
  type ConsentState,
  type ConsentAuditEntry,
  type ConsentAction,
  createConsentState,
  recordConsentAction,
  isActionConsented,
} from "./consent";

export {
  NSFWContentRating,
  NSFW_RATING_SEVERITY,
  NSFW_RATING_HIERARCHY,
  type NSFWRatingEnforcement,
  type EnforcementPoint,
  computeEffectiveRating,
  isRatingAllowed,
  createRatingEnforcement,
} from "./nsfw-rating";
