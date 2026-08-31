// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/schemas/consent.ts — Unified Consent Schema
//
// Shared between NSFW encounters and Chat Lifecycle moderation.
// Provides consent tracking, revocation, and audit trail.

// ── Consent Action Types ──────────────────────────────────────

/** Actions that can be recorded in the consent audit trail. */
export type ConsentAction = "given" | "revoked" | "modified" | "overridden";

// ── Audit Trail ───────────────────────────────────────────────

/** A single entry in the consent audit trail. */
export interface ConsentAuditEntry {
  /** When the action occurred. */
  timestamp: Date;
  /** Who performed the action (user ID, actor ID, or "system"). */
  actor: string;
  /** What action was taken. */
  action: ConsentAction;
  /** Optional reason for the action. */
  reason?: string;
  /** If admin override, who performed it. */
  moderator?: string;
  /** Optional context (encounter_id, chat_id, etc.). */
  context?: Record<string, unknown>;
}

// ── Core Consent State ────────────────────────────────────────

/**
 * Unified consent state for NSFW encounters.
 * Tracks whether consent has been given, is revocable, and maintains an audit trail.
 */
export interface ConsentState {
  /** Whether consent is required for this context (always true for NSFW). */
  consent_required: boolean;
  /** Whether explicit consent has been given. */
  consent_given: boolean;
  /** Whether the affected party is aware they are being affected. */
  consent_aware: boolean;
  /** When consent was last given or modified. */
  consent_timestamp: Date;
  /** Whether consent can be revoked at runtime. */
  consent_revocable: boolean;
  /** What actions are covered by this consent (e.g. ["nsfw_encounter", "nsfw_dialogue"]). */
  consent_scope: string[];
  /** Full audit trail of consent changes. */
  audit_trail: ConsentAuditEntry[];
}

// ── Defaults & Factory ────────────────────────────────────────

/**
 * Create a ConsentState with sensible defaults.
 * @param scope - Actions covered by this consent
 * @returns A new ConsentState with consent not yet given
 */
export function createConsentState(scope: string[] = [],): ConsentState {
  return {
    consent_required: true,
    consent_given: false,
    consent_aware: false,
    consent_timestamp: new Date(),
    consent_revocable: true,
    consent_scope: scope,
    audit_trail: [],
  };
}

/**
 * Record a consent action in the audit trail and update state.
 * @param state - Current consent state (mutated)
 * @param action - Action to record
 * @param params - Additional details
 * @param params.actor
 * @param params.reason
 * @param params.moderator
 * @param params.context
 * @param params.scope
 * @returns Updated state
 */
export function recordConsentAction(
  state: ConsentState,
  action: ConsentAction,
  params: {
    actor: string;
    reason?: string;
    moderator?: string;
    context?: Record<string, unknown>;
    scope?: string[];
  },
): ConsentState {
  const entry: ConsentAuditEntry = {
    timestamp: new Date(),
    actor: params.actor,
    action,
    reason: params.reason,
    moderator: params.moderator,
    context: params.context,
  };

  state.audit_trail.push(entry,);
  state.consent_timestamp = entry.timestamp;

  switch (action) {
    case "given": {
      state.consent_given = true;
      state.consent_aware = true;
      break;
    }
    case "revoked": {
      state.consent_given = false;
      break;
    }
    case "modified": {
      if (params.scope) { state.consent_scope = params.scope; }
      break;
    }
    case "overridden": {
      state.consent_given = true;
      break;
    }
  }

  return state;
}

/**
 * Check if a specific action is covered by the current consent.
 * @param state - Current consent state
 * @param action - Action to check
 * @returns true if consent covers the action and has been given
 */
export function isActionConsented(state: ConsentState, action: string): boolean {
  return state.consent_given
    && state.consent_required
    && state.consent_scope.includes(action,);
}
