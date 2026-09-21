// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Lore section — actor and world lore entries. Constant and non-selective
 * entries are always included; selective entries activate based on their
 * activation condition:
 *
 *   - default keyword keys: when one of `keys` appears in the scanned window,
 *   - `key_type === "regex"`: when any of `keys` (compiled as regex) matches
 *     the scanned conversation text,
 *   - `key_groups`: AND/OR keyword groups (inner array = AND, outer = OR).
 *
 * `scan_depth` controls how many recent user messages are scanned (default 1,
 * max 10). `activation_chance` (0..1) stochastically gates an otherwise-relevant
 * entry for ambient world-building. Entries with active cooldowns are excluded
 * until the cooldown expires. Entries with an audience scope
 * (race/profession/location) are filtered by the speaking actor's identity.
 *
 * Lifecycle gate (TASK-world-lore-lifecycle-confidence-decay-distortion):
 * each world's `worlds.rules.lifecycle_config` may set a `min_confidence`
 * floor; rows whose `effectiveConfidence` (decay + distortion adjusted) drop
 * below the floor are dropped. Rows whose `distortion_level` crosses the
 * `distortion_cap` are wrapped in `<disputed>` so downstream consumers can
 * surface them with reduced trust. Defaults are identity for worlds that
 * have not opted in (`min_confidence = 25`, decay 0.5/day, cap 80).
 *
 * Included entries are ordered by `priority` (high first) then insertion order.
 */
import { isLoreVisibleTo, parseLoreScope, } from "../../lore/audience";
import type { ActorIdentity, } from "../../lore/audience";
import { wrapSection, } from "../../xml-utils";
import { recentConversation, } from "../keywords";
import type { SectionBuilder, } from "../types";
import {
  clampScanDepth,
  isCooldownExpired,
  matchesSelectiveKeys,
  MAX_SCAN_DEPTH,
  passesActivationChance,
} from "./lore-activation";
import { isLoreDisputed, passesConfidenceFloor, } from "./lore-lifecycle-gate";
import { loadLore, } from "./lore-load";
import type { LoreRow, } from "./lore-types";

export const loreSection: SectionBuilder = {
  name: "lore",
  enabled: (ctx,) => ctx.params.includeLore !== false,
  build: async (ctx,) => {
    const { chat, params, } = ctx;
    const loaded = await loadLore(ctx,);
    const identityWithLocation: ActorIdentity = {
      ...loaded.actorIdentity,
      locationId: chat.current_location_id ?? null,
    };

    // Compile the conversation scan window once. When selective keys are given
    // explicitly (e.g. from the UI), activate against those instead of the DB.
    // Otherwise scan up to the deepest scan_depth among entries that need a scan
    // (capped), deriving per-entry word/text slices from `recentMessages`.
    const allEntries: LoreRow[] = loaded.entries;
    const needsScan = allEntries.some(
      (e,) => !params.selectiveKeys && e.selective && !e.constant,
    );
    let maxDepth = 1;
    if (needsScan) {
      let deepest = 1;
      for (const entry of allEntries) {
        deepest = Math.max(deepest, clampScanDepth(entry.scan_depth,),);
      }
      maxDepth = Math.min(deepest, MAX_SCAN_DEPTH,);
    }
    // Conversation scan window, most recent first. When selective keys are given
    // explicitly (UI override) they stand in for the conversation.
    const scanned = params.selectiveKeys ? null : await recentConversation(ctx.db, params.chatId, maxDepth,);
    const recentMessages = params.selectiveKeys
      ? Array.from(params.selectiveKeys,)
      : scanned!.text.split("\n",);

    const isRelevant = (entry: LoreRow,): boolean => {
      // Audience gate first — forbidden lore is never considered for activation.
      if (!isLoreVisibleTo({ audienceScope: parseLoreScope(entry.audience_scope,), }, identityWithLocation,)) {
        return false;
      }
      // Lifecycle confidence floor (TASK-world-lore-lifecycle-confidence-decay-distortion).
      if (!passesConfidenceFloor(entry, loaded.lifecycleConfig,)) { return false; }
      // Check cooldown second
      if (!isCooldownExpired(entry.last_activated, entry.cooldown_seconds,)) {
        return false;
      }
      if (entry.constant) { return passesActivationChance(entry.activation_chance,); }
      if (!entry.selective) { return passesActivationChance(entry.activation_chance,); }

      // Selective: build the per-entry scan window (first `scanDepth` messages).
      const depth = clampScanDepth(entry.scan_depth,);
      const window = recentMessages.slice(0, depth,).join("\n",);
      const words = new Set<string>();
      for (const w of window.toLowerCase().split(/[^a-z0-9]+/i,)) {
        if (w) { words.add(w,); }
      }
      if (!matchesSelectiveKeys(entry, words, window,)) { return false; }
      return passesActivationChance(entry.activation_chance,);
    };

    const relevantEntries: LoreRow[] = [];
    for (const entry of allEntries) {
      if (isRelevant(entry,)) { relevantEntries.push(entry,); }
    }

    // Priority weighting — high-priority entries sort before low-priority ones;
    // ties keep stable insertion order (position asc from the query).
    relevantEntries.sort((a, b,) => b.priority - a.priority);

    // Update last_activated for entries that were included
    const now = new Date().toISOString();
    for (const entry of relevantEntries) {
      if (entry.cooldown_seconds <= 0) { continue; }
      // Try actor_lore_entries first
      const actorResult = await ctx.db
        .updateTable("actor_lore_entries",)
        .set({ last_activated: now, },)
        .where("id", "=", entry.id,)
        .executeTakeFirst();

      // If no rows affected, try world_lore_entries
      if (Number(actorResult.numUpdatedRows,) === 0) {
        void ctx.db
          .updateTable("world_lore_entries",)
          .set({ last_activated: now, },)
          .where("id", "=", entry.id,)
          .execute()
          .catch(() => {
            // Ignore errors - cooldown tracking is non-critical
          },);
      }
    }

    // Disputed entries (distortion_level >= cfg.distortion_cap OR `disputed`
    // column flagged) are wrapped in `<disputed>` so downstream consumers can
    // surface them with reduced trust. Non-disputed entries stay plain.
    const parts: string[] = [];
    const undisputedList: string[] = [];
    const disputedList: string[] = [];
    for (const entry of relevantEntries) {
      if (isLoreDisputed(entry, loaded.lifecycleConfig,)) { disputedList.push(entry.content,); }
      else { undisputedList.push(entry.content,); }
    }
    if (undisputedList.length > 0) { parts.push(undisputedList.join("\n\n",),); }
    if (disputedList.length > 0) {
      // Disputed entries are tagged with a bracket sentinel that survives
      // XML escaping (the outer `wrapSection("lore", …)` would mangle `<…>`
      // and `>…<`); `[disputed]` is plain text to the escape pass.
      const lines = disputedList.flatMap((c,) => [`[disputed] ${c}`,]);
      parts.push(lines.join("\n\n",),);
    }
    const loreText = parts.join("\n\n",);
    return loreText ? [{ role: "system", content: wrapSection("lore", loreText,), },] : [];
  },
};
