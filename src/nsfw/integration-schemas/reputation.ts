// ── Reputation Score (Shared: Social, Faction, NSFW) ─────────

/** Reputation tier based on value range */
export type ReputationTier =
  | "hostile"
  | "unfriendly"
  | "neutral"
  | "friendly"
  | "allied"
  | "devoted";

/** Source of reputation change */
export type ReputationSource = "social" | "faction" | "nsfw" | "combined";

/** Reputation modifier */
export interface ReputationModifier {
  /** What caused this modifier */
  reason: string;
  /** Value change (-100 to +100) */
  value: number;
  /** When this modifier was applied */
  appliedAt: string;
  /** Optional expiration */
  expiresAt?: string;
}

/** Unified reputation score used across Social, Faction, and NSFW systems */
export interface ReputationScore {
  /** Target actor ID */
  actorId: string;
  /** Viewer/observer actor ID */
  viewerId: string;
  /** Reputation value (-100 to +100) */
  value: number;
  /** Computed tier based on value */
  tier: ReputationTier;
  /** Primary source of this reputation */
  source: ReputationSource;
  /** When this reputation was last modified */
  lastModified: string;
  /** Daily decay rate (0 = no decay) */
  decayRate: number;
  /** Active modifiers affecting this reputation */
  modifiers: ReputationModifier[];
}

/** Compute reputation tier from value */
export function computeReputationTier(value: number,): ReputationTier {
  if (value <= -80) { return "hostile"; }
  if (value <= -40) { return "unfriendly"; }
  if (value <= 20) { return "neutral"; }
  if (value <= 60) { return "friendly"; }
  if (value <= 85) { return "allied"; }
  return "devoted";
}
