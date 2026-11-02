// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Lore activation conditions — the pure selective-activation rules for a lore
 * entry, independent of DB access. FEAT-055.
 *
 * A lore entry activates through one of three selective matchers:
 *
 *   - default keyword keys: when one of `keys` appears in the scanned window,
 *   - `key_type === "regex"`: when any of `keys` (compiled as regex) matches the
 *     scanned conversation text,
 *   - `key_groups`: AND/OR keyword groups (inner array = AND, outer = OR).
 *
 * `scan_depth` bounds how many recent user messages are scanned (default 1,
 * cap 10); `activation_chance` (0..1) stochastically gates an otherwise-relevant
 * entry for ambient world-building. Invalid regex patterns are treated as
 * no-match so prompt assembly never crashes on bad author input.
 *
 * Inclusion groups (epic-lorebook-inclusion-groups): admitted entries that
 * share a non-empty `inclusion_group` are mutually exclusive — the
 * `admitExclusiveGroups` pass keeps exactly one of them per turn.
 */
import { parseExpiryMs, } from "../../../utils/date";
import { compileSafeRegExp, } from "../../../utils/safe-regexp";
import { parseInclusionGroup, parseKeyGroups, parseKeywords, } from "../keywords";

/** Maximum number of recent user messages scanned for activation. */
export const MAX_SCAN_DEPTH = 10;

/** The lore-entry fields the activation rules read (a subset of the DB row). */
export interface ActivationEntry {
  keys: unknown;
  key_type: string | null;
  key_groups: string | null;
  scan_depth: number | null;
  activation_chance: number | null;
}

/**
 * Clamp an entry's scan_depth into the valid range (default 1, max {@link MAX_SCAN_DEPTH}).
 * @param scanDepth
 * @returns number
 */
export function clampScanDepth(scanDepth: number | null,): number {
  if (scanDepth == null || scanDepth <= 0) { return 1; }
  return Math.min(scanDepth, MAX_SCAN_DEPTH,);
}

/**
 * Compile a lore key into a RegExp, or return null when it is invalid or
 * unsafe. Keys are author/imported-card controlled — safe compile rejects
 * catastrophic-backtracking shapes so a malicious card cannot freeze every
 * chat turn. Invalid patterns are treated as no-match (never crash prompt
 * assembly).
 * @param key
 * @returns void
 */
function compileKeyRegex(key: string,): RegExp | null {
  return compileSafeRegExp(key, "i",);
}

/** Result of matching a lore entry's activation condition against the scan window. */
export interface SelectiveMatch {
  /** Whether the entry's activation condition is satisfied. */
  active: boolean;
  /**
   * How many keys the entry matched — the specificity score inclusion groups
   * rank by (generic fallback vs. specific override).
   */
  matched: number;
}

/**
 * Test an entry's selective activation against a conversation word set and
 * raw text, and report how specific the match was. Order: regex keys ->
 * key groups (AND/OR) -> plain keyword fallback.
 *
 * `matched` counts the keys of the satisfied condition: the number of
 * matching regex patterns, the size of the largest satisfied AND group, or
 * the number of present plain keywords. An entry with no activation
 * condition at all (no regex keys, no groups, no keywords) is treated as
 * always-active, preserving the pre-FEAT-055 behavior where a selective
 * entry with empty keys is unconditionally included.
 * @param entry
 * @param words
 * @param text
 * @returns void
 */
export function matchSelectiveKeys(
  entry: ActivationEntry,
  words: ReadonlySet<string>,
  text: string,
): SelectiveMatch {
  if (entry.key_type === "regex") { return matchRegexKeys(entry, text,); }

  const groups = parseKeyGroups(entry.key_groups,);
  if (groups) { return matchKeyGroups(groups, words,); }

  return matchPlainKeys(entry, words,);
}

/**
 * Match regex keys against the raw scan text; count the matching patterns.
 * @param entry
 * @param text
 * @returns void
 */
function matchRegexKeys(entry: ActivationEntry, text: string,): SelectiveMatch {
  const patterns = parseKeywords(entry.keys,);
  if (patterns.length === 0) { return { active: true, matched: 0, }; }
  let matched = 0;
  for (const key of patterns) {
    const re = compileKeyRegex(key,);
    if (re?.test(text,)) { matched++; }
  }

  return { active: matched > 0, matched, };
}

/**
 * Match AND/OR keyword groups; count the keys of the largest satisfied group.
 * @param groups
 * @param words
 * @returns void
 */
function matchKeyGroups(groups: string[][], words: ReadonlySet<string>,): SelectiveMatch {
  let matched = 0;
  for (const group of groups) {
    if (group.every((k,) => words.has(k.toLowerCase(),))) { matched = Math.max(matched, group.length,); }
  }

  return { active: matched > 0, matched, };
}

/**
 * Match plain keyword keys; count the keywords present in the scan window.
 * @param entry
 * @param words
 * @returns void
 */
function matchPlainKeys(entry: ActivationEntry, words: ReadonlySet<string>,): SelectiveMatch {
  const keys = parseKeywords(entry.keys,);
  if (keys.length === 0) { return { active: true, matched: 0, }; }
  let matched = 0;
  for (const key of keys) {
    if (words.has(key.toLowerCase(),)) { matched++; }
  }

  return { active: matched > 0, matched, };
}

/**
 * Whether an otherwise-relevant entry is admitted by its activation_chance.
 * @param chance
 * @returns void
 */
export function passesActivationChance(chance: number | null,): boolean {
  if (chance == null) { return true; }
  const clamped = Math.min(1, Math.max(0, chance,),);
  return Math.random() < clamped;
}

/**
 * Check if a lore entry's cooldown has expired (no last_activated timestamp
 * or cooldown_seconds <= 0 means "always eligible").
 * @param lastActivated
 * @param cooldownSeconds
 * @returns True when the cooldown has elapsed (or never applied).
 */
export function isCooldownExpired(
  lastActivated: string | null,
  cooldownSeconds: number,
): boolean {
  if (cooldownSeconds <= 0) { return true; }
  const lastActivatedMs = parseExpiryMs(lastActivated,);
  if (lastActivatedMs === null) { return true; }
  const cooldownMs = cooldownSeconds * 1000;
  return Date.now() - lastActivatedMs >= cooldownMs;
}

/** A lore entry that passed the per-entry gates, considered for group admission. */
export interface InclusionGroupCandidate {
  /** Lore row id (unique across the actor and world lore tables). */
  id: string;
  /** Raw inclusion-group name; blank or absent = no group. */
  inclusion_group: string | null;
  /** Number of keys the entry matched in the scan window. */
  matched_keys: number;
  /** Entry priority — higher wins a tie. */
  priority: number;
  /** Author-set insertion order — lower wins a tie. */
  insertion_order: number;
}

/** Per-group admission outcome: the winner and the entries it excluded. */
export interface InclusionGroupDecision {
  /** Normalized group name. */
  group: string;
  /** Id of the entry that fires. */
  winner_id: string;
  /** Ids of the group members that were skipped. */
  skipped_ids: string[];
}

/** Result of the inclusion-group admission pass. */
export interface InclusionGroupAdmission<T,> {
  /** Entries that fire (group winners plus every ungrouped entry), in input order. */
  admitted: T[];
  /** One decision per contested group. */
  decisions: InclusionGroupDecision[];
}

/**
 * Whether `candidate` beats `incumbent` as a group winner: most matched keys
 * first (generic fallback, specific override), then higher priority, then
 * lower insertion order. A full tie keeps the incumbent — the candidate that
 * came first in collection order.
 * @param candidate
 * @param incumbent
 * @returns void
 */
function beatsGroupWinner<T extends InclusionGroupCandidate,>(candidate: T, incumbent: T,): boolean {
  if (candidate.matched_keys !== incumbent.matched_keys) {
    return candidate.matched_keys > incumbent.matched_keys;
  }

  if (candidate.priority !== incumbent.priority) {
    return candidate.priority > incumbent.priority;
  }

  return candidate.insertion_order < incumbent.insertion_order;
}

/**
 * Group the candidates by their normalized inclusion-group name.
 * @param candidates
 * @returns void
 */
function bucketByGroup<T extends InclusionGroupCandidate,>(candidates: readonly T[],): Map<string, T[]> {
  const buckets = new Map<string, T[]>();
  for (const candidate of candidates) {
    const group = parseInclusionGroup(candidate.inclusion_group,);
    if (group === null) { continue; }
    const bucket = buckets.get(group,);
    if (bucket) { bucket.push(candidate,); }
    else { buckets.set(group, [candidate,],); }
  }

  return buckets;
}

/**
 * The group member that fires: most matched keys, then higher priority, then
 * lower insertion order, then the earlier candidate.
 * @param bucket
 * @returns void
 */
function pickGroupWinner<T extends InclusionGroupCandidate,>(bucket: readonly T[],): T {
  let winner = bucket[0]!;
  for (let i = 1; i < bucket.length; i++) {
    const candidate = bucket[i]!;
    if (beatsGroupWinner(candidate, winner,)) { winner = candidate; }
  }

  return winner;
}

/**
 * Exclusive admission pass for lore inclusion groups
 * (epic-lorebook-inclusion-groups): at most one admitted entry per
 * non-empty inclusion group fires per turn.
 *
 * The winner is the group member that matched the most keys; ties go to the
 * higher priority, then to the lower insertion order, then to the earlier
 * candidate in collection order. Entries without a group are unaffected.
 * @param candidates Admitted entries in collection order.
 * @returns The admitted subset and one decision per group.
 */
export function admitExclusiveGroups<T extends InclusionGroupCandidate,>(
  candidates: readonly T[],
): InclusionGroupAdmission<T> {
  const kept = new Set<T>();
  for (const candidate of candidates) {
    if (parseInclusionGroup(candidate.inclusion_group,) === null) { kept.add(candidate,); }
  }

  const decisions: InclusionGroupDecision[] = [];
  for (const [group, bucket,] of bucketByGroup(candidates,)) {
    const winner = pickGroupWinner(bucket,);
    kept.add(winner,);
    const skipped: string[] = [];
    for (const candidate of bucket) {
      if (candidate !== winner) { skipped.push(candidate.id,); }
    }

    decisions.push({ group, winner_id: winner.id, skipped_ids: skipped, },);
  }

  return { admitted: candidates.filter((candidate,) => kept.has(candidate,)), decisions, };
}
