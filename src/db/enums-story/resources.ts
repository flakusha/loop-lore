// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * DB Schema Enums — World Resources
 *
 * Enums for the resource-extraction system (migration 060): the per-instance
 * quality tier on `gathering_node_instances`, and the vocabulary describing
 * why a storage access check refused an actor.
 */

// ── Resource Quality ────────────────────────────────────────────────
/**
 * ResourceQuality — the tier of ONE concrete node instance
 * (`gathering_node_instances.quality`, migration 060).
 *
 * Deliberately distinct from the crafting epic's `QualityLevel`: that enum
 * grades an ITEM (and includes `poor`), while this grades the node you swing
 * at. A `poor` ore vein is still a vein — it is not a lesser item, so reusing
 * `QualityLevel` here would smuggle an item-grade onto a world feature and let
 * a caller write `QualityLevel.Poor` against a node that cannot express it.
 */
export const ResourceQuality = {
  Common: "common",
  Uncommon: "uncommon",
  Rare: "rare",
  Epic: "epic",
  Legendary: "legendary",
} as const;
/** */
export type ResourceQuality = (typeof ResourceQuality)[keyof typeof ResourceQuality];

/**
 * The quality tiers ordered weakest → strongest. Extraction difficulty is
 * scaled by position in this list, so the ordering IS the balance knob:
 * index 0 (common) adds no difficulty, each tier above adds one step.
 */
export const RESOURCE_QUALITY_ORDER: readonly ResourceQuality[] = [
  ResourceQuality.Common,
  ResourceQuality.Uncommon,
  ResourceQuality.Rare,
  ResourceQuality.Epic,
  ResourceQuality.Legendary,
];

// ── Storage Access ──────────────────────────────────────────────────
/**
 * Why `checkStorageAccess` refused an actor. A discriminated union rather than
 * a boolean so a caller can tell "you are not on the guest list" from "this
 * chest belongs to somebody else" — both deny, but only one is worth telling a
 * player.
 */
export const StorageAccessDenial = {
  /** The actor is not the owner and not on the guest list. */
  NotAllowed: "not-allowed",
  /** The actor is denied because the storage demands a security level they lack. */
  SecurityTooLow: "security-too-low",
  /** The caller is acting in a different world than the storage belongs to. */
  CrossWorld: "cross-world",
} as const;
/** */
export type StorageAccessDenial = (typeof StorageAccessDenial)[keyof typeof StorageAccessDenial];
