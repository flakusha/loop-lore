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
 * Included entries are ordered by `priority` (high first) then insertion order.
 */
import { isLoreVisibleTo, parseLoreScope, } from "../../lore/audience";
import type { ActorIdentity, } from "../../lore/audience";
import { wrapSection, } from "../../xml-utils";
import { recentConversation, } from "../keywords";
import type { SectionBuilder, } from "../types";
import {
  type ActivationEntry,
  clampScanDepth,
  matchesSelectiveKeys,
  MAX_SCAN_DEPTH,
  passesActivationChance,
} from "./lore-activation";
import { resolveActorIdentity, } from "./lore-identity";

/** Row shape returned by the lore queries (used by relevance + audience filtering). */
interface LoreRow extends ActivationEntry {
  content: string;
  position: unknown;
  constant: number | boolean;
  selective: number | boolean;
  cooldown_seconds: number;
  last_activated: string | null;
  id: string;
  audience_scope: string | null;
  priority: number;
}

/** Check if a lore entry's cooldown has expired. */
function isCooldownExpired(
  lastActivated: string | null,
  cooldownSeconds: number,
): boolean {
  if (cooldownSeconds <= 0) { return true; }
  if (!lastActivated) { return true; }
  const lastActivatedMs = new Date(lastActivated,).getTime();
  const cooldownMs = cooldownSeconds * 1000;
  return Date.now() - lastActivatedMs >= cooldownMs;
}

export const loreSection: SectionBuilder = {
  name: "lore",
  enabled: (ctx,) => ctx.params.includeLore !== false,
  build: async (ctx,) => {
    const { actor, chat, params, } = ctx;
    const locationId = chat.current_location_id ?? null;

    const loreResults = await Promise.allSettled([
      ctx.db
        .selectFrom("actor_lore_entries",)
        .select([
          "content",
          "keys",
          "position",
          "constant",
          "selective",
          "cooldown_seconds",
          "last_activated",
          "id",
          "audience_scope",
          "key_type",
          "key_groups",
          "scan_depth",
          "activation_chance",
          "priority",
        ],)
        .where("actor_id", "=", actor.id,)
        .where("enabled", "=", "enabled",)
        .where((eb,) =>
          chat.world_id
            ? eb.or([
              eb("world_id", "is", null,),
              eb("world_id", "=", chat.world_id,),
            ],)
            : eb("world_id", "is", null,)
        )
        .orderBy("position", "asc",)
        .execute(),
      chat.world_id
        ? ctx.db
          .selectFrom("world_lore_entries",)
          .select([
            "content",
            "keys",
            "position",
            "constant",
            "selective",
            "cooldown_seconds",
            "last_activated",
            "id",
            "audience_scope",
            "key_type",
            "key_groups",
            "scan_depth",
            "activation_chance",
            "priority",
          ],)
          .where("world_id", "=", chat.world_id,)
          .where("enabled", "=", "enabled",)
          .orderBy("position", "asc",)
          .execute()
        : Promise.resolve([] as LoreRow[],),
      resolveActorIdentity(ctx.db, actor.id, chat.world_id,),
    ],);
    const actorLoreResult = loreResults[0];
    const worldLoreResult = loreResults[1];
    const identityResult = loreResults[2];
    if (actorLoreResult.status === "rejected") { throw actorLoreResult.reason; }
    if (worldLoreResult.status === "rejected") { throw worldLoreResult.reason; }
    if (identityResult.status === "rejected") { throw identityResult.reason; }
    const actorLore = actorLoreResult.value;
    const worldLore = worldLoreResult.value;
    const identity = identityResult.value;

    const identityWithLocation: ActorIdentity = { ...identity, locationId, };

    const allEntries: LoreRow[] = [...actorLore, ...worldLore,];

    // Compile the conversation scan window once. When selective keys are given
    // explicitly (e.g. from the UI), activate against those instead of the DB.
    // Otherwise scan up to the deepest scan_depth among entries that need a scan
    // (capped), deriving per-entry word/text slices from `recentMessages`.
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

    const loreText = Array.from(relevantEntries, (e,) => e.content,).join("\n\n",);

    return loreText ? [{ role: "system", content: wrapSection("lore", loreText,), },] : [];
  },
};
