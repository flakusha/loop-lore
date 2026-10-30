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
 * Secret lore (084, epic-lore-knowledge): entries with a `reveal_condition`
 * (JSON) stay withheld until the condition is met — `keywords` matched
 * against the entry's scan window and/or `event` matched against the chat's
 * timeline events; `all`/`any` combine sub-conditions; malformed JSON fails
 * closed (same convention as invalid regex keys).
 *
 * Timeline scoping (084): rows with a `timeline_id` exist only on that
 * timeline branch — filtered at load time against `chats.timeline_id`
 * (see `lore-load.ts`); NULL rows are timeline-universal.
 *
 * Rarity (084): after activation, non-common entries are admitted by their
 * rarity weight (`LORE_RARITY_WEIGHTS`), so rare tiers surface sparingly.
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
import { getConvergentEvents, } from "../../../story/timeline/convergence";
import { listPendingSteerings, } from "../../../story/timeline/event-steering";
import { isLoreVisibleTo, parseLoreScope, } from "../../lore/audience";
import type { ActorIdentity, } from "../../lore/audience";
import { passesRarityWeight, } from "../../lore/rarity-weight";
import {
  hasRevealCondition,
  parseRevealCondition,
  revealConditionMet,
} from "../../lore/reveal-condition";
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

    // Lowercased word set from a scan window — shared by the selective
    // activation matcher and reveal-condition keyword leaves.
    const windowWords = (window: string,): Set<string> => {
      const words = new Set<string>();
      for (const w of window.toLowerCase().split(/[^a-z0-9]+/i,)) {
        if (w) { words.add(w,); }
      }

      return words;
    };

    // Final stochastic gates shared by every activation path: ambient
    // activation_chance, then rarity-weighted selection (epic-lore-knowledge).
    const admitStochastically = (entry: LoreRow,): boolean =>
      passesActivationChance(entry.activation_chance,) &&
      passesRarityWeight(entry.rarity,);

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

      // Secret-lore reveal gate (084/epic-lore-knowledge): entries with a
      // reveal_condition stay withheld until conversation keywords or the
      // chat's timeline events satisfy the condition. Malformed conditions
      // fail closed — the entry is never revealed by accident.
      if (hasRevealCondition(entry.reveal_condition,)) {
        const revealWindow = recentMessages
          .slice(0, clampScanDepth(entry.scan_depth,),)
          .join("\n",);

        const condition = parseRevealCondition(entry.reveal_condition,);
        if (condition === null) { return false; }
        const met = revealConditionMet(condition, {
          words: windowWords(revealWindow,),
          timelineEventTypes: loaded.timelineEvents.eventTypes,
          timelineEventText: loaded.timelineEvents.descriptionText,
        },);

        if (!met) { return false; }
      }

      if (entry.constant || !entry.selective) { return admitStochastically(entry,); }

      // Selective: build the per-entry scan window (first `scanDepth` messages).
      const depth = clampScanDepth(entry.scan_depth,);
      const window = recentMessages.slice(0, depth,).join("\n",);
      const words = windowWords(window,);

      if (!matchesSelectiveKeys(entry, words, window,)) { return false; }
      return admitStochastically(entry,);
    };

    const relevantEntries: LoreRow[] = [];
    for (const entry of allEntries) {
      if (isRelevant(entry,)) { relevantEntries.push(entry,); }
    }

    // Priority weighting — high-priority entries sort before low-priority ones;
    // ties keep stable insertion order (position asc from the query).
    relevantEntries.sort((a, b,) => b.priority - a.priority);

    // Update activation timestamps for entries that were included.
    //
    // Two tables own lore rows: `actor_lore_entries` (per-character) and
    // `world_lore_entries` (per-world, lifecycle-aware). Each gets its
    // own timestamp columns, so the writes are split per row.
    //   - actor_lore_entries: `last_activated` (cooldown tracking only).
    //   - world_lore_entries: `last_activated` + `last_verified`
    //     (BUG-lore-lifecycle-fields-have-no-producers-… minimal producer:
    //     every world row seen in a prompt is now marked verified, which
    //     is the precondition for any future temporal-decay plumbing).
    //
    // Errors are swallowed: cooldown / verification tracking are
    // non-critical and must never fail prompt assembly.
    const now = new Date().toISOString();
    for (const entry of relevantEntries) {
      if (entry.cooldown_seconds <= 0) { continue; }
      // Try actor_lore_entries first
      const actorResult = await ctx.db
        .updateTable("actor_lore_entries",)
        .set({ last_activated: now, },)
        .where("id", "=", entry.id,)
        .executeTakeFirst();

      // If no rows affected, try world_lore_entries. Awaited (not floating) so
      // the write is sequenced with the actor-side update above and cannot
      // outlive prompt assembly.
      if (Number(actorResult.numUpdatedRows,) === 0) {
        try {
          await ctx.db
            .updateTable("world_lore_entries",)
            .set({ last_activated: now, last_verified: now, },)
            .where("id", "=", entry.id,)
            .execute();
        } catch {
          // Ignore errors - cooldown / verification tracking is non-critical
        }
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

    // Timeline foreshadowing + cross-story convergence (epic-timeline-system
    // lore-injection AC). Pending steerings inject as audience-scoped
    // foreshadowing on the chat's branch; convergent world events surface
    // sibling stories' consequences while the caller's own story is excluded
    // by getConvergentEvents. Audience filtering reuses the lore gate;
    // bracket sentinels survive the wrapSection escape pass like [disputed].
    if (chat.world_id) {
      const pending = await listPendingSteerings({
        db: ctx.db,
        worldId: chat.world_id,
        timelineId: chat.timeline_id ?? undefined,
        limit: MAX_PROMPT_STEERINGS,
      },);

      const visibleSteerings = pending.filter((row,) =>
        isLoreVisibleTo({ audienceScope: parseLoreScope(row.audience_scope,), }, identityWithLocation,)
      );

      const convergent = await getConvergentEvents({
        db: ctx.db,
        worldId: chat.world_id,
        excludeStoryId: chat.id,
        limit: MAX_CONVERGENT_EVENTS,
      },);

      const timelineLines = [
        ...Array.from(visibleSteerings, (row,) => `[foreshadowing] ${row.description}`,),
        ...Array.from(convergent, (row,) => `[sibling story] ${row.description}`,),
      ];

      if (timelineLines.length > 0) { parts.push(timelineLines.join("\n",),); }
    }

    const loreText = parts.join("\n\n",);
    return loreText ? [{ role: "system", content: wrapSection("lore", loreText,), },] : [];
  },
};

/** Cap on pending steerings injected as foreshadowing per prompt. */
export const MAX_PROMPT_STEERINGS = 5;

/** Cap on sibling-story convergent events injected per prompt. */
export const MAX_CONVERGENT_EVENTS = 10;
