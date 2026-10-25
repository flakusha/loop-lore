// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * /item-update — assistant command to modify an item definition.
 */

import { checkWorldOwnership, } from "../../routes/story-items/handlers";
import { safeJsonStringify, } from "../../utils";
import {
  parseItemUpdates,
} from "./items";
import { type CommandResult, registerCommand, } from "./registry";

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
