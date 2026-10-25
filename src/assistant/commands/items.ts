// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /item-list, /item-get, /item-update, /inventory — assistant access to item
 * definitions and the items a character carries. `/item-update` previews a
 * mutation the `PUT` branch of `handleDefinition` applies.
 *
 * Item data is world-scoped and owner-scoped, so every command here runs
 * `checkWorldOwnership` from `src/routes/story-items/handlers.ts` before any
 * row is read. Reads go through `ItemsService` rather than raw SQL so the
 * definition/instance join stays in one place.
 */

import { checkWorldOwnership, } from "../../routes/story-items/handlers";
import { type ItemInstance, ItemsService, } from "../../story/items";
import { safeJsonParse, safeJsonStringify, } from "../../utils";
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

  const owned = await checkWorldOwnership(db, worldId, ctx.userId ?? null, ctx.userRole ?? null,);
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

  // Resolve the world before any item detail is selected. The chat's world wins
  // when it has one: an item belonging to some *other* world is then never even
  // identified by this query, rather than being identified and then rejected.
  // Outside a world-scoped chat the row's own `world_id` is the only place it is
  // recorded, so that is the fallback. Either way the projection is a single
  // column and ownership is checked before `getDefinition` below.
  const chatWorldId = ctx.activeChat?.worldId;
  const byId = db.selectFrom("items",).select("world_id",).where("id", "=", itemId,);
  const row = chatWorldId
    ? await byId.where("world_id", "=", chatWorldId,).executeTakeFirst()
    : await byId.executeTakeFirst();

  if (!row) {
    return { systemMessage: `Item ${itemId} ${DENIED}.`, handled: true, };
  }

  const owned = await checkWorldOwnership(db, row.world_id, ctx.userId ?? null, ctx.userRole ?? null,);
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

/**
 * Update fields `/item-update` accepts, keyed as the user writes them. They map
 * onto what `handleDefinition` (`src/routes/story-items/handlers.ts`) reads
 * from the `PUT /api/v1/worlds/:worldId/items/:itemId` body.
 */
const ITEM_UPDATE_STRING_FIELDS = ["name", "description", "category", "rarity",] as const;
/** Numeric fields `/item-update` accepts. */
const ITEM_UPDATE_NUMBER_FIELDS = ["value", "weight",] as const;
/** Every accepted field, for unknown-field error messages. */
const ALL_ITEM_UPDATE_FIELDS = [...ITEM_UPDATE_STRING_FIELDS, ...ITEM_UPDATE_NUMBER_FIELDS, "properties",] as const;

/**
 * One `key=value` pair parsed out of an `/item-update` argument list.
 */
export type ItemUpdatePatch = Partial<
  Record<(typeof ALL_ITEM_UPDATE_FIELDS)[number], string | number | Record<string, unknown>>
>;

/** A JSON object (arrays excluded) — the shape the route stores in `properties`. */
function isJsonObject(value: unknown,): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value,);
}

export type ParseItemUpdatesResult =
  | { ok: true; updates: ItemUpdatePatch }
  | { ok: false; error: string };

/**
 * Parse `key=value` update pairs from the text after the item id. Values may
 * be quoted to include spaces; unquoted values end at whitespace. Tokens that
 * are not `key=value` pairs are ignored. A repeated key is LAST-WINS: the
 * final pair overwrites earlier ones in the returned patch.
 * @param input - raw argument text after the item id
 * @returns ok with the allowed-field patch, or an error describing the first bad pair
 */
export function parseItemUpdates(input: string,): ParseItemUpdatesResult {
  const pairRe = /([a-zA-Z]+)\s*=\s*("([^"]*)"|'([^']*)'|(\S+))/g;
  const updates: ItemUpdatePatch = {};
  let matched = false;

  for (const match of input.matchAll(pairRe,)) {
    matched = true;
    const key = match[1] ?? "";
    const value = match[3] ?? match[4] ?? match[5] ?? "";

    if ((ITEM_UPDATE_STRING_FIELDS as readonly string[]).includes(key,)) {
      if (key === "name" && value === "") {
        return { ok: false, error: 'Field "name" expects a non-empty item name, got "".', };
      }

      updates[key as keyof ItemUpdatePatch] = value;
      continue;
    }

    if ((ITEM_UPDATE_NUMBER_FIELDS as readonly string[]).includes(key,)) {
      const num = Number(value,);
      if (!Number.isFinite(num,)) {
        return { ok: false, error: `Field "${key}" expects a number, got "${value}".`, };
      }

      updates[key as keyof ItemUpdatePatch] = num;
      continue;
    }

    if (key === "properties") {
      const parsed = safeJsonParse<unknown>(value,);
      if (!parsed.ok || !isJsonObject(parsed.value,)) {
        return {
          ok: false,
          error: 'Field "properties" expects a JSON object, e.g. properties={"damage":"1d6"}.',
        };
      }

      updates.properties = parsed.value;
      continue;
    }

    return {
      ok: false,
      error: `Unknown item field "${key}" — allowed: ${ALL_ITEM_UPDATE_FIELDS.join(", ",)}.`,
    };
  }

  if (!matched) {
    return {
      ok: false,
      error: 'No updates parsed — use key=value pairs, e.g. name="Iron Sword" value=50.',
    };
  }

  return { ok: true, updates, };
}

registerCommand("item-update", async (args, ctx,): Promise<CommandResult> => {
  const itemId = args[0];
  if (!itemId) {
    return {
      systemMessage: 'Usage: /item-update <item-id> name="Iron Sword" value=50 description="…"',
      handled: true,
    };
  }

  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**Items unavailable:** command context missing database.", handled: true, };
  }

  // Same resolve-then-guard ordering `/item-get` uses: the world must be known
  // before `checkWorldOwnership` runs, and in a world-scoped chat a foreign
  // world's item is never even identified. The guard is the exact one
  // `handleDefinition` applies to its own `PUT` handler, so the preview never
  // confirms a write the route would refuse. "Missing" and "not owned"
  // produce byte-identical messages so the id cannot be used as an existence
  // oracle.
  const DENIED = `Item ${itemId} not found or access denied.`;
  const chatWorldId = ctx.activeChat?.worldId;
  const byId = db.selectFrom("items",).select(["id", "name", "world_id",],).where("id", "=", itemId,);
  const row = chatWorldId
    ? await byId.where("world_id", "=", chatWorldId,).executeTakeFirst()
    : await byId.executeTakeFirst();

  if (!row) {
    return { systemMessage: DENIED, handled: true, };
  }

  const owned = await checkWorldOwnership(db, row.world_id, ctx.userId ?? null, ctx.userRole ?? null,);
  if (!owned) {
    return { systemMessage: DENIED, handled: true, };
  }

  const parsed = parseItemUpdates(args.slice(1,).join(" ",),);
  if (!parsed.ok) {
    return { systemMessage: `**Item update rejected:** ${parsed.error}`, handled: true, };
  }

  const changes = Object.entries(parsed.updates,)
    .map(([field, value,],) => {
      const serialized = typeof value === "object" ? safeJsonStringify(value,) : { ok: true, value, };
      return `- **${field}** → ${serialized.ok ? serialized.value : ""}`;
    },)
    .join("\n",);

  return {
    systemMessage: [
      `**Update preview** — **${row.name}** [${itemId}] will change:\n\n${changes}`,
      "Confirm in the dialog to apply.",
    ].join("\n\n",),
    action: "item-update",
    actionPayload: {
      itemId,
      worldId: row.world_id,
      updates: parsed.updates,
      name: row.name,
    },
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

  const owned = await checkWorldOwnership(db, worldId, ctx.userId ?? null, ctx.userRole ?? null,);
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
