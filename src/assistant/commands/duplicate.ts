// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `/duplicate <kind> <source-id> [--with key=value …] [--as "New Name"]` —
 * duplicate an entity with optional modifications (epic batch B5).
 *
 * Preview-only: the source is loaded through its adapter's ownership guard
 * and the copied+overridden fields travel in a `duplicate-entity` preview
 * action; the frontend confirms and posts to the SAME create-entity confirm
 * route `/create` uses (server re-validates before insert). Duplicates stay
 * with the ORIGINAL owner: the confirm route attributes the new row to the
 * confirming caller, which is also who must own the source to get here.
 *
 * `/clone` (location|item, positional `key=value`) remains unchanged; the
 * epic's `--with` grammar lands here for all four kinds.
 */

import { ENTITY_ADAPTERS, } from "../adapter/adapters";
import { DUPLICATE_ENTITY_KINDS, } from "../adapter/entity";
import { formatPatch, parseEntityPatch, type PatchSpec, } from "./entity-patch";
import {
  ITEM_ADD_SPEC,
  LOCATION_ADD_SPEC,
  WORLD_APPLY_SPEC,
} from "./entity-patch-spec";
import { type CommandResult, registerCommand, } from "./registry";

/** Character copy fields keyed the way the create-entity route accepts them. */
const CHARACTER_COPY_SPEC: PatchSpec = {
  name: { type: "string", },
  description: { type: "string", },
  personality: { type: "string", },
  appearance: { type: "string", },
  scenario: { type: "string", },
};

/** Per-kind override spec: what the confirm route's insert path reads. */
function overrideSpec(kind: string,): PatchSpec {
  if (kind === "character") { return CHARACTER_COPY_SPEC; }
  if (kind === "world") { return WORLD_APPLY_SPEC; }
  if (kind === "location") { return { ...LOCATION_ADD_SPEC, name: { type: "string" as const, }, }; }
  return { ...ITEM_ADD_SPEC, name: { type: "string" as const, }, };
}

registerCommand("duplicate", async (args, ctx,): Promise<CommandResult> => {
  const [kind, sourceId,] = args;
  if (!kind || !sourceId) {
    return {
      systemMessage: 'Usage: /duplicate <character|world|location|item> <source-id> [--with key=value …] [--as "Name"]',
      handled: true,
    };
  }

  if (!(DUPLICATE_ENTITY_KINDS as readonly string[]).includes(kind,)) {
    return {
      systemMessage: `Unknown entity kind "${kind}" — /duplicate supports: ${DUPLICATE_ENTITY_KINDS.join(", ",)}.`,
      handled: true,
    };
  }

  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**Duplicate unavailable:** command context missing database.", handled: true, };
  }

  const loaded = await ENTITY_ADAPTERS[kind as keyof typeof ENTITY_ADAPTERS].loadForCopy(
    db,
    sourceId,
    ctx.userId ?? null,
    ctx.userRole ?? null,
  );

  if (!loaded.ok) {
    return { systemMessage: loaded.message, handled: true, };
  }

  const { entity, } = loaded;

  // Flag grammar: `--with` introduces key=value overrides (last-wins),
  // `--as "Name"` renames the copy. Both optional, order fixed (`--with` then
  // `--as`) so the split stays a single scan.
  const rest = args.slice(2,);
  const asIdx = rest.indexOf("--as",);
  const asName = asIdx >= 0 ? rest.slice(asIdx + 1,).join(" ",).trim().replace(/^"|"$/g, "",) : "";
  const overrideTokens = (asIdx >= 0 ? rest.slice(0, asIdx,) : rest).filter((t,) => t !== "--with");

  const rawOverrides = overrideTokens.join(" ",).trim();
  const parsed = rawOverrides === ""
    ? { ok: true as const, patch: {} as Record<string, never>, }
    : parseEntityPatch(rawOverrides, overrideSpec(kind,), kind,);

  if (!parsed.ok) {
    return { systemMessage: `**Duplicate rejected:** ${parsed.error}`, handled: true, };
  }

  const overridden = Object.keys(parsed.patch,);
  const fields = { ...entity.fields, ...parsed.patch, };
  const overrideName = typeof fields.name === "string" && fields.name !== entity.name
    ? fields.name
    : undefined;

  const newName = asName || overrideName || `${entity.name} (copy)`;
  fields.name = newName;

  const overrideNote = overridden.length > 0
    ? `Overridden: ${overridden.map((f,) => `\`${f}\``).join(", ",)}.`
    : "No overrides — an exact copy (renamed).";

  return {
    systemMessage: [
      `**Duplicate preview** — copy **${entity.name}** [${sourceId}] as **${newName}** in ${
        entity.worldId ? `world \`${entity.worldId}\`` : "your characters"
      }:`,
      "",
      formatPatch(fields,),
      "",
      overrideNote,
      entity.note ? entity.note : "",
      "Confirm in the dialog to create the copy.",
    ].filter((l,) => l !== "").join("\n\n",),
    action: "duplicate-entity",
    actionPayload: {
      kind,
      sourceId,
      name: newName,
      worldId: entity.worldId ?? null,
      fields,
      overriddenFields: overridden,
    },
    handled: true,
  };
}, { requiredRole: "member", },);
