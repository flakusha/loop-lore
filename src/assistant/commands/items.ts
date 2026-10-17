// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /item-list, /item-get, /inventory — assistant read access to item definitions
 * and the items a character carries.
 *
 * Item data is world-scoped and owner-scoped, so every command here runs
 * `checkWorldOwnership` from `src/routes/story-items/handlers.ts` before any
 * row is read. Reads go through `ItemsService` rather than raw SQL so the
 * definition/instance join stays in one place.
 */

import { checkWorldOwnership, } from "../../routes/story-items/handlers";
import { type ItemInstance, ItemsService, } from "../../story/items";
import { type CommandResult, registerCommand, } from "./registry";

const DENIED = "not found or access denied";

registerCommand("item-list", async (args, ctx,): Promise<CommandResult> => {
  const worldId = args[0] ?? ctx.activeChat?.worldId;
  if (!worldId) {
    return {
      systemMessage: "Usage: /item-list [world-id] — pass a world-id when the chat has no world.",
      handled: true,
    };
  }

  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**Items unavailable:** command context missing database.", handled: true, };
  }

  const owned = await checkWorldOwnership(db, worldId, ctx.userId ?? null, null,);
  if (!owned) {
    return { systemMessage: `World ${worldId} ${DENIED}.`, handled: true, };
  }

  const defs = await new ItemsService(db,).listDefinitions(worldId,);
  if (defs.length === 0) {
    return { systemMessage: `No item definitions in world ${worldId}.`, handled: true, };
  }

  const list = defs.map((d,) => `- **${d.name}** (${d.category}, ${d.rarity}) [${d.id}]`).join("\n",);
  return {
    systemMessage: `**Items (${defs.length}):**\n\n${list}`,
    action: "item-list",
    actionPayload: { worldId, items: defs, },
    handled: true,
  };
}, { requiredRole: "member", },);

registerCommand("item-get", async (args, ctx,): Promise<CommandResult> => {
  const itemId = args[0];
  if (!itemId) {
    return { systemMessage: "Usage: /item-get <item-id>", handled: true, };
  }

  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**Items unavailable:** command context missing database.", handled: true, };
  }

  const row = await db.selectFrom("items",).select("world_id",).where("id", "=", itemId,).executeTakeFirst();
  if (!row) {
    return { systemMessage: `Item ${itemId} ${DENIED}.`, handled: true, };
  }

  const owned = await checkWorldOwnership(db, row.world_id, ctx.userId ?? null, null,);
  if (!owned) {
    return { systemMessage: `Item ${itemId} ${DENIED}.`, handled: true, };
  }

  const items = new ItemsService(db,);
  const def = await items.getDefinition(itemId, row.world_id,);
  if (!def) {
    return { systemMessage: `Item ${itemId} ${DENIED}.`, handled: true, };
  }

  const instances = await db
    .selectFrom("world_items",)
    .select(["id", "location_id", "owner_actor_id", "quantity", "visibility",],)
    .where("world_id", "=", row.world_id,)
    .where("item_id", "=", itemId,)
    .execute();

  const instList = instances.length === 0
    ? "_none_ — no placed copies_"
    : instances.map((i,) =>
      `- x${i.quantity} at ${i.location_id ?? `actor ${i.owner_actor_id}`} (${i.visibility}) [${i.id}]`
    ).join("\n",);

  return {
    systemMessage: [
      `**Item:** ${def.name} [${def.id}]`,
      `**Category:** ${def.category} · **Rarity:** ${def.rarity}`,
      `**Value:** ${def.value} · **Weight:** ${def.weight} · **Stackable:** ${def.stackable}`,
      def.description ? `**Description:** ${def.description}` : "",
      `**Instances (${instances.length}):**\n${instList}`,
    ].filter(Boolean,).join("\n",),
    action: "item-get",
    actionPayload: { item: def, instances, },
    handled: true,
  };
}, { requiredRole: "member", },);

registerCommand("inventory", async (args, ctx,): Promise<CommandResult> => {
  const charId = args[0] ?? ctx.currentCharacter?.id;
  if (!charId) {
    return {
      systemMessage: "Usage: /inventory [char-id] — pass a char-id when the chat has no current character.",
      handled: true,
    };
  }

  const worldId = ctx.activeChat?.worldId;
  if (!worldId) {
    return {
      systemMessage: "**Inventory unavailable:** the chat is not attached to a world.",
      handled: true,
    };
  }

  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**Items unavailable:** command context missing database.", handled: true, };
  }

  const owned = await checkWorldOwnership(db, worldId, ctx.userId ?? null, null,);
  if (!owned) {
    return { systemMessage: `World ${worldId} ${DENIED}.`, handled: true, };
  }

  const carried: ItemInstance[] = await new ItemsService(db,).getNpcInventory(charId, worldId,);
  if (carried.length === 0) {
    return { systemMessage: `Nothing carried by ${charId}.`, handled: true, };
  }

  const list = carried
    .map((i,) => `- x${i.quantity} **${i.name}** (${i.category}, ${i.rarity}) [${i.itemId}]`)
    .join("\n",);

  return {
    systemMessage: `**Carried by ${charId} (${carried.length}):**\n\n${list}`,
    action: "inventory",
    actionPayload: { worldId, charId, items: carried, },
    handled: true,
  };
}, { requiredRole: "member", },);
