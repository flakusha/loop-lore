// ── Consent State (Shared: Chat Lifecycle, NSFW) ─────────────

/** Consent status for NSFW interactions */
export type ConsentStatus = "pending" | "granted" | "denied" | "revoked";

/** Consent scope */
export type ConsentScope = "encounter" | "session" | "persistent";

/** Unified consent state for NSFW interactions */
export interface ConsentState {
  /** Actor giving consent */
  actorId: string;
  /** Current consent status */
  status: ConsentStatus;
  /** How long consent lasts */
  scope: ConsentScope;
  /** When consent was given/revoked */
  timestamp: string;
  /** Optional expiration for scoped consent */
  expiresAt?: string;
  /** What was consented to */
  consentedTo: string[];
  /** Reason for denial/revocation if applicable */
  reason?: string;
}

/** Check if consent is active */
export function isConsentActive(consent: ConsentState,): boolean {
  if (consent.status !== "granted") { return false; }
  if (consent.expiresAt && new Date(consent.expiresAt,) < new Date()) { return false; }
  return true;
}
