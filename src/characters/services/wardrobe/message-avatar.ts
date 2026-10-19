// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-message avatar resolution for the chat render path.
 *
 * The ladder ordering has exactly one owner: `selectAvatar`
 * (`avatar-service/selection.ts`), which runs `runOutfitLadder` and, on a
 * miss, restricts the remaining passes to outfitless variants before falling
 * through to the base portrait. This module only decides WHETHER a message
 * needs that answer and hands the result to the client — it never re-orders a
 * rung, so the two copies cannot drift.
 *
 * Leaving `avatar_asset_id` unset is the deliberate zero-regression case: no
 * wardrobe in play means the client's emotion-only walk renders the message
 * exactly as before.
 *
 * Contract: this function NEVER throws. Every ladder miss, dangling
 * `outfit_id`, deleted location rule or torn-down database degrades to
 * "field absent" so the client keeps rendering.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { getChildLogger, } from "../../../logger";
import { AvatarService, } from "../avatar-service";
import { resolveOutfit, } from "./resolve";

/**
 * One message row, as the chat list route hands it over: the loose
 * `Record<string, unknown>` the read path already produces. Only `role`,
 * `actor_id`, `emotion`, `section_id` and `avatar_asset_id` are read or
 * written; every other column passes through to the client untouched.
 */
export type MessageAvatarRow = Record<string, unknown>;

/** Options for {@link attachMessageAvatars}. */
export interface AttachMessageAvatarsOpts {
  database: Kysely<DB>;
  chatId: string;
  /** Message rows to annotate in place. */
  messages: MessageAvatarRow[];
}

/**
 * Only these roles render an avatar in `message-list.html`. `system` and
 * narration rows still carry an `actor_id` (the column is notNull) but the
 * template never draws them, so resolving one is pure waste on long pages.
 */
const AVATAR_ROLE: Record<string, true> = {
  assistant: true,
  character: true,
};

/** Chat-level context the outfit precedence needs to reach rungs 2 and 3. */
interface ChatContext {
  worldId: string | null;
  currentLocationId: string | null;
  locationBySection: Map<string, string | null>;
}

const NO_CONTEXT: ChatContext = {
  worldId: null,
  currentLocationId: null,
  locationBySection: new Map(),
};

/**
 * Read the chat's world and section→location map once per page.
 *
 * `resolveOutfit` short-circuits its location rule unless BOTH ids are
 * present, so omitting them makes that rung structurally unreachable.
 * @param database
 * @param chatId
 * @returns {Promise<ChatContext>}
 */
async function loadChatContext(database: Kysely<DB>, chatId: string,): Promise<ChatContext> {
  const chat = await database
    .selectFrom("chats",)
    .select(["world_id", "current_location_id",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  const sections = await database
    .selectFrom("chat_sections",)
    .select(["id", "location_id",],)
    .where("chat_id", "=", chatId,)
    .execute();

  return {
    worldId: chat?.world_id ?? null,
    currentLocationId: chat?.current_location_id ?? null,
    locationBySection: new Map(sections.map((s,) => [s.id, s.location_id,] as const),),
  };
}

/**
 * Annotate assistant/character message rows with their resolved avatar asset.
 *
 * Only a row's own actor is ever consulted — the variant list, the outfit
 * override and the base portrait are all keyed by that actor id, so a message
 * can never resolve another actor's asset.
 *
 * Two memos, because outfit resolution does not depend on emotion while the
 * avatar does, and BOTH depend on location: two messages from the same actor
 * in sections with different locations must resolve to different outfits.
 * @param opts
 * @param opts.database
 * @param opts.chatId
 * @param opts.messages
 * @returns {Promise<void>}
 */
export async function attachMessageAvatars(opts: AttachMessageAvatarsOpts,): Promise<void> {
  const { database, chatId, messages, } = opts;
  // getChildLogger returns null instead of throwing when no root logger is
  // installed — getLogger() would escape the catch below and 500 the page.
  const log = getChildLogger("wardrobe.message-avatar",);

  let context = NO_CONTEXT;
  try {
    context = await loadChatContext(database, chatId,);
  } catch (error) {
    log?.error(
      "Failed to load chat context for message avatars",
      error instanceof Error ? error : undefined,
      { chatId, },
    );
  }

  const avatars = new AvatarService(database,);
  const outfitCache = new Map<string, string | null>();
  const assetCache = new Map<string, string | null>();

  for (const msg of messages) {
    // Never leave a stale asset from a previous pass on the row.
    delete msg.avatar_asset_id;

    const actorId = msg.actor_id;
    if (typeof actorId !== "string" || !actorId) { continue; }
    if (typeof msg.role !== "string" || !AVATAR_ROLE[msg.role]) { continue; }

    try {
      const sectionLocation = typeof msg.section_id === "string"
        ? context.locationBySection.get(msg.section_id,)
        : undefined;

      const locationId = sectionLocation ?? context.currentLocationId ?? undefined;

      // resolveOutfit is emotion-independent, so memo it on actor+location only.
      const outfitKey = `${actorId} ${locationId ?? ""}`;
      let outfitId = outfitCache.get(outfitKey,);
      if (outfitId === undefined) {
        outfitId = (await resolveOutfit(database, {
          actorId,
          chatId,
          worldId: context.worldId ?? undefined,
          locationId,
        },)).outfitId;

        outfitCache.set(outfitKey, outfitId,);
      }

      // A null outfit means "no wardrobe in play" — leave the field absent so
      // the client's emotion-only walk owns the render, exactly as before.
      if (outfitId === null) { continue; }

      const emotion = typeof msg.emotion === "string" ? msg.emotion : undefined;
      const assetKey = `${actorId} ${locationId ?? ""} ${emotion ?? ""}`;
      let assetId = assetCache.get(assetKey,);
      if (assetId === undefined) {
        assetId = (await avatars.selectAvatar(actorId, { emotion, chatId, outfitId, },))?.assetId ?? null;
        assetCache.set(assetKey, assetId,);
      }

      if (assetId) { msg.avatar_asset_id = assetId; }
    } catch (error) {
      // The wardrobe can change under the resolver between the page query and
      // this loop. One unresolvable row must cost that row its outfit-aware
      // avatar, never the whole message page: leave the field absent so the
      // client falls back, and record why.
      log?.error(
        "Failed to resolve message avatar",
        error instanceof Error ? error : undefined,
        { chatId, actorId, messageId: typeof msg.id === "string" ? msg.id : undefined, },
      );
    }
  }
}
