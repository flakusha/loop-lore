// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `/apply` — direct field-level patches on an existing entity (epic batch
 * B4, `epic-assistant-entity-access.md`).
 *
 * Preview-only: the command parses the arguments, checks the SAME guard the
 * underlying HTTP route applies, and returns a preview action the frontend
 * confirms before calling the real route. Nothing is persisted here.
 *
 * Route called on confirm (frontend `apply-entity` handler in
 * `src/frontend/alpine/chat-actions/entities.ts`):
 * - PUT /api/v1/worlds/:worldId                    (world patch)
 * - PUT /api/v1/worlds/:worldId/locations/:locId   (location patch)
 * - PUT /api/v1/worlds/:worldId/items/:itemId      (item patch)
 * - PUT /api/v1/actors/:actorId                    (character patch)
 */
import { requireOwnedCharacter, requireOwnedWorldEntity, } from "./entity-guard";
import { formatPatch, locationEffects, parseEntityPatch, } from "./entity-patch";
import {
  CHARACTER_MODIFY_SPEC,
  ITEM_APPLY_SPEC,
  LOCATION_APPLY_SPEC,
  WORLD_APPLY_SPEC,
} from "./entity-patch-spec";
import { type CommandResult, registerCommand, } from "./registry";

const NO_DB = (what: string,): CommandResult => ({
  systemMessage: `**${what} unavailable:** command context missing database.`,
  handled: true,
});

const APPLY_KINDS = ["world", "location", "item", "character",] as const;

// ── /apply <kind> <id> <patch> ───────────────────────────────

registerCommand("apply", async (args, ctx,): Promise<CommandResult> => {
  const kind = (args[0] || "") as (typeof APPLY_KINDS)[number];
  const entityId = args[1] || "";
  if (!kind || !entityId) {
    return {
      systemMessage:
        'Usage: /apply <world|location|item|character> <id> name="New Name" description="…" (characters patch displayName)',
      handled: true,
    };
  }

  if (!APPLY_KINDS.includes(kind,)) {
    return {
      systemMessage: `Unknown entity kind "${kind}" — /apply supports: ${APPLY_KINDS.join(", ",)}.`,
      handled: true,
    };
  }

  const db = ctx.db;
  if (!db) {
    return NO_DB(
      kind === "world" ? "Worlds" : kind === "location" ? "Locations" : kind === "item" ? "Items" : "Characters",
    );
  }

  const spec = kind === "world"
    ? WORLD_APPLY_SPEC
    : kind === "location"
    ? LOCATION_APPLY_SPEC
    : kind === "item"
    ? ITEM_APPLY_SPEC
    : CHARACTER_MODIFY_SPEC;

  const parsed = parseEntityPatch(args.slice(2,).join(" ",), spec, kind,);
  if (!parsed.ok) {
    return { systemMessage: `**Update patch rejected:** ${parsed.error}`, handled: true, };
  }

  // The patch is parsed before any row is touched, but the guard runs before
  // the preview. For world the id IS the scope; for location/item `world_id`
  // lives on the row, so the row is read first — the same read-first ordering
  // `/loc-get` uses. Characters carry their own ownership guard
  // (`checkActorOwnership`) — the actor PUT route's own guard.
  let name: string;
  let worldId: string;
  let contentVersion: number | undefined;
  if (kind === "character") {
    const owned = await requireOwnedCharacter(db, entityId, ctx.userId ?? null, ctx.userRole ?? null,);
    if (!owned.ok) { return { systemMessage: owned.message, handled: true, }; }
    name = owned.character.name;
    worldId = "";
    // The actor PUT route requires the optimistic-locking version.
    contentVersion = owned.character.contentVersion;
  } else {
    const owned = await requireOwnedWorldEntity(db, kind, entityId, ctx.userId ?? null, ctx.userRole ?? null,);
    if (!owned.ok) { return { systemMessage: owned.message, handled: true, }; }
    name = owned.scope.name;
    worldId = owned.scope.worldId;
  }

  const changes = formatPatch(parsed.patch,);
  const effects = kind === "location" ? locationEffects(parsed.patch,) : [];
  // World and location PUT routes set updated_at unconditionally
  // (handleUpdateWorld/handleUpdateLocation); the item PUT route does too.
  // Surface it for every kind so the preview names every row the confirm touches.
  effects.push(kind === "world" ? "Touches `updated_at` on the world row." : "Touches `updated_at` on the row.",);

  return {
    systemMessage: [
      `**Update preview** — **${name}** [${entityId}] will change:\n\n${changes}`,
      effects.length > 0 ? `**Effects:**\n${effects.map((e,) => `- ${e}`).join("\n",)}` : "",
      "Confirm in the dialog to apply.",
    ].filter(Boolean,).join("\n\n",),
    action: "apply-entity",
    actionPayload: {
      kind,
      entityId,
      worldId,
      updates: parsed.patch,
      name,
      ...(contentVersion !== undefined ? { contentVersion, } : {}),
    },
    handled: true,
  };
}, { requiredRole: "member", },);
