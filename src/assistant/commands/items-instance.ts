// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /item-transfer, /item-drop, /item-pickup — assistant commands that move an
 * item instance between characters and locations.
 *
 * These commands do NOT mutate. Each guards and validates, then returns a
 * preview whose `actionPayload` carries everything the frontend confirm dialog
 * needs — including entity NAMES, never raw ids — and which the handler in
 * `src/frontend/alpine/chat-actions/item-actions.ts` turns into
 * POST /api/v1/worlds/:worldId/item-instances/:instanceId/transfer. That route
 * accepts `toLocationId` and/or `toActorId`, so:
 *   - transfer → explicit destination (location or character)
 *   - drop     → toLocationId = the chat's current location
 *   - pickup   → toActorId  = the chat's current character
 *
 * Item data is world-scoped and owner-scoped, so every command here runs
 * `checkWorldOwnership` from `src/routes/story-items/handlers.ts` before any
 * row is read.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { checkWorldOwnership, } from "../../routes/story-items/handlers";
import { DENIED, } from "./items";
import { type CommandContext, type CommandResult, registerCommand, } from "./registry";

/**
 * One `world_items` row plus its definition name — the minimum the mutation
 * commands need to guard, name the item, and describe the real effect.
 */
interface InstanceRow {
  id: string;
  world_id: string;
  item_id: string;
  location_id: string | null;
  owner_actor_id: string | null;
  quantity: number;
  name: string;
}

/**
 * Resolve a `world_items` row (with the definition's display name) for a
 * mutation command. When the chat has a world the lookup is narrowed to it —
 * an instance belonging to some *other* world is then never even identified,
 * so "missing" and "not owned" stay indistinguishable. Outside a world-scoped
 * chat the row's own `world_id` is the only place it is recorded, so that is
 * the fallback. Mirrors the read-first ordering `/item-get` uses.
 */
async function resolveInstance(
  db: Kysely<DB>,
  instanceId: string,
  chatWorldId: string | undefined,
): Promise<InstanceRow | null> {
  const byId = db
    .selectFrom("world_items",)
    .innerJoin("items", "items.id", "world_items.item_id",)
    .select([
      "world_items.id",
      "world_items.world_id",
      "world_items.item_id",
      "world_items.location_id",
      "world_items.owner_actor_id",
      "world_items.quantity",
      "items.name",
    ],)
    .where("world_items.id", "=", instanceId,);

  const row = chatWorldId
    ? await byId.where("world_items.world_id", "=", chatWorldId,).executeTakeFirst()
    : await byId.executeTakeFirst();

  return row ?? null;
}

/**
 * Shared guard for the mutation commands: resolve the instance, then apply the
 * same `checkWorldOwnership` gate `handleTransfer`/`handleInstance` apply on
 * the HTTP routes. Missing and not-owned return byte-identical messages so the
 * instance id cannot be used as an existence oracle.
 */
async function guardInstance(
  ctx: CommandContext,
  instanceId: string,
): Promise<{ db: Kysely<DB>; instance: InstanceRow } | { error: string }> {
  const db = ctx.db;
  if (!db) {
    return { error: "**Items unavailable:** command context missing database.", };
  }

  const instance = await resolveInstance(db, instanceId, ctx.activeChat?.worldId,);
  if (!instance) {
    return { error: `Item instance ${instanceId} ${DENIED}.`, };
  }

  const owned = await checkWorldOwnership(db, instance.world_id, ctx.userId ?? null, ctx.userRole ?? null,);
  if (!owned) {
    return { error: `Item instance ${instanceId} ${DENIED}.`, };
  }

  return { db, instance, };
}

/** How the transfer route names its destination, for preview text. */
function destinationLabel(payload: { toLocationId?: string; toActorId?: string; toName: string },): string {
  const kind = payload.toActorId ? "character" : "location";
  return `${kind} **${payload.toName}** [${payload.toActorId ?? payload.toLocationId}]`;
}

registerCommand("item-transfer", async (args, ctx,): Promise<CommandResult> => {
  const [instanceId, to,] = args;
  if (!instanceId || !to) {
    return {
      systemMessage: "Usage: /item-transfer <instance-id> <location-id | char-id>",
      handled: true,
    };
  }

  const guarded = await guardInstance(ctx, instanceId,);
  if ("error" in guarded) {
    return { systemMessage: guarded.error, handled: true, };
  }

  const { db, instance, } = guarded;

  // Resolve the destination: a location in the instance's world first, then a
  // character. The transfer route itself only validates locations against the
  // world, so the command narrows it here rather than letting the confirm
  // dialog fire for a destination that would 404.
  const loc = await db
    .selectFrom("locations",)
    .select(["id", "name",],)
    .where("id", "=", to,)
    .where("world_id", "=", instance.world_id,)
    .executeTakeFirst();

  const actor = loc ? null : await db
    .selectFrom("actors",)
    .select(["id", "display_name",],)
    .where("id", "=", to,)
    // World-narrowed like the location branch: an actor outside the instance's
    // world would make the item invisible to every inventory surface.
    .where((eb,) =>
      eb.exists(
        eb.selectFrom("world_members",)
          .select("actor_id",)
          .whereRef("world_members.actor_id", "=", "actors.id",)
          .where("world_members.world_id", "=", instance.world_id,),
      )
    )
    .executeTakeFirst();

  if (!loc && !actor) {
    return {
      systemMessage: `**Transfer rejected:** ${to} is neither a location in this world nor a character.`,
      handled: true,
    };
  }

  const payload = {
    worldId: instance.world_id,
    instanceId,
    quantity: instance.quantity,
    ...(loc ? { toLocationId: loc.id, } : { toActorId: actor!.id, }),
    itemName: instance.name,
    toName: loc?.name ?? actor!.display_name,
  };

  return {
    systemMessage: [
      `**Transfer preview** — **${instance.name}** [${instanceId}] (x${instance.quantity}) will move to ${
        destinationLabel(payload,)
      }.`,
      "If the destination already holds the same item, the copies stack into one pile; otherwise a new pile is placed there.",
      "Confirm in the dialog to apply.",
    ].join("\n\n",),
    action: "item-transfer",
    actionPayload: payload,
    handled: true,
  };
}, { requiredRole: "member", capabilities: ["write-world", "cross-user",], },);

registerCommand("item-drop", async (args, ctx,): Promise<CommandResult> => {
  const instanceId = args[0];
  if (!instanceId) {
    return { systemMessage: "Usage: /item-drop <instance-id>", handled: true, };
  }

  const guarded = await guardInstance(ctx, instanceId,);
  if ("error" in guarded) {
    return { systemMessage: guarded.error, handled: true, };
  }

  const { db, instance, } = guarded;
  if (!instance.owner_actor_id) {
    return {
      systemMessage: `**Drop rejected:** **${instance.name}** [${instanceId}] is not being carried by anyone.`,
      handled: true,
    };
  }

  // "Drop at the current location" means the chat's scene location — the same
  // `chats.current_location_id` the travel and GM systems treat as "here".
  const chat = await db
    .selectFrom("chats",)
    .select("current_location_id",)
    .where("id", "=", ctx.chatId,)
    .executeTakeFirst();

  if (!chat?.current_location_id) {
    return {
      systemMessage: "**Drop unavailable:** the chat has no current location to drop the item at.",
      handled: true,
    };
  }

  const loc = await db
    .selectFrom("locations",)
    .select("name",)
    .where("id", "=", chat.current_location_id,)
    .executeTakeFirst();

  const payload = {
    worldId: instance.world_id,
    instanceId,
    quantity: instance.quantity,
    toLocationId: chat.current_location_id,
    itemName: instance.name,
    toName: loc?.name ?? chat.current_location_id,
  };

  return {
    systemMessage: [
      `**Drop preview** — **${instance.name}** [${instanceId}] (x${instance.quantity}) will be taken out of its holder's inventory and placed on the ground at location **${payload.toName}** [${chat.current_location_id}].`,
      "It stays visible there until someone picks it up; if the location already holds the same item the copies stack.",
      "Confirm in the dialog to apply.",
    ].join("\n\n",),
    action: "item-drop",
    actionPayload: payload,
    handled: true,
  };
}, { requiredRole: "member", capabilities: ["write-world", "cross-user",], },);

registerCommand("item-pickup", async (args, ctx,): Promise<CommandResult> => {
  const instanceId = args[0];
  const toActorId = args[1] ?? ctx.currentCharacter?.id;
  if (!instanceId || !toActorId) {
    return {
      systemMessage:
        "Usage: /item-pickup <instance-id> [char-id] — pass a char-id when the chat has no current character.",
      handled: true,
    };
  }

  const guarded = await guardInstance(ctx, instanceId,);
  if ("error" in guarded) {
    return { systemMessage: guarded.error, handled: true, };
  }

  const { db, instance, } = guarded;
  if (!instance.location_id || instance.owner_actor_id) {
    return {
      systemMessage: `**Pickup rejected:** **${instance.name}** [${instanceId}] is not lying at a location.`,
      handled: true,
    };
  }

  const receiver = await db
    .selectFrom("actors",)
    .select("display_name",)
    .where("id", "=", toActorId,)
    // Same world-membership narrowing as /item-transfer: an actor outside the
    // instance's world could never see the item again after picking it up.
    .where((eb,) =>
      eb.exists(
        eb.selectFrom("world_members",)
          .select("actor_id",)
          .whereRef("world_members.actor_id", "=", "actors.id",)
          .where("world_members.world_id", "=", instance.world_id,),
      )
    )
    .executeTakeFirst();

  if (!receiver) {
    return {
      systemMessage: `**Pickup rejected:** ${toActorId} is not a character.`,
      handled: true,
    };
  }

  const payload = {
    worldId: instance.world_id,
    instanceId,
    quantity: instance.quantity,
    toActorId,
    itemName: instance.name,
    toName: receiver.display_name,
  };

  return {
    systemMessage: [
      `**Pickup preview** — **${instance.name}** [${instanceId}] (x${instance.quantity}) will be removed from the ground and added to character **${receiver.display_name}** [${toActorId}]'s inventory.`,
      "If the character already carries the same item the copies stack into one pile.",
      "Confirm in the dialog to apply.",
    ].join("\n\n",),
    action: "item-pickup",
    actionPayload: payload,
    handled: true,
  };
}, { requiredRole: "member", capabilities: ["write-world", "cross-user",], },);
