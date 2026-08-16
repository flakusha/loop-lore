// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Type of chat transition */
export type TransitionType = "description" | "context_cut" | "location_change";

/** A chat transition event */
export interface ChatTransition {
  type: TransitionType;
  /** Who initiated the transition */
  actorId: string;
  /** Optional narration text for the transition */
  narration?: string;
  /** Message IDs promoted to memory during this transition */
  promotedMemoryIds: string[];
  /** New location ID if this is a location change */
  newLocationId?: string;
  /** Timestamp of the transition */
  createdAt: string;
}

/** Classification source for transition detection */
export type TransitionSource = "regex" | "aux-llm" | "none";

/** Result of transition classification */
export interface TransitionClassification {
  /** Whether the message is a transition */
  isTransition: boolean;
  /** Type of transition (null if not a transition) */
  type: TransitionType | null;
  /** Confidence score (0-1) */
  confidence: number;
  /** Extracted location name hint (null if not available) */
  locationHint: string | null;
  /** Source of the classification */
  source: TransitionSource;
}
