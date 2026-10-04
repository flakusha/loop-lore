// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/autonomy/governor/caps.ts — cap resolution for a governor scope
//
// Actor-scoped consumes read `AutonomyConfig.perAgentCap`; user-scoped
// consumes read `perUserCap`. `null` means unbounded — the governor then
// skips the DB entirely and always allows.

import { type Kysely, sql, } from "kysely";
import type { DB, } from "../../db/schema";
import { resolveAutonomyConfig, } from "../config";
import type { AutonomyConfig, } from "../config";
import type { AutonomyScope, TryConsumeOptions, } from "./types";

/** Sentinel for a row id that cannot exist. Both config columns read as
 *  `{}` for it, so an unresolvable scope still gets the preset baseline
 *  (finite caps) rather than an unbounded one.
 */
const NO_ROW = "__none__";

/**
 * Resolve the world id for a consume: an explicit hint wins, otherwise
 * follow the chat's own world link.
 *
 * @param db
 * @param opts
 * @returns the world id, or null when neither hint is available
 */
async function resolveWorldId(
  db: Kysely<DB>,
  opts: TryConsumeOptions,
): Promise<string | null> {
  if (opts.worldId !== undefined) { return opts.worldId; }
  if (opts.chatId === undefined) { return null; }
  const result = await sql<{ world_id: string | null }>`
    SELECT world_id FROM chats WHERE id = ${opts.chatId} LIMIT 1
  `.execute(db,);

  return result.rows[0]?.world_id ?? null;
}

/**
 * Resolve the layered autonomy config for a scope's consume.
 *
 * The world layer is the config surface's default and must be part of the
 * lookup, or a world-level `perAgentCap` silently resolves to the preset's
 * instead. It comes from `opts.worldId` when given, else from the chat row.
 *
 * @param db
 * @param root0
 * @param root0.scope
 * @param root0.opts
 * @returns the resolved config
 */
export async function resolveScopeConfig(
  db: Kysely<DB>,
  { scope, opts, }: { scope: AutonomyScope; opts: TryConsumeOptions },
): Promise<AutonomyConfig> {
  const worldId = await resolveWorldId(db, opts,) ?? NO_ROW;
  return resolveAutonomyConfig(db, {
    worldId,
    chatId: opts.chatId ?? NO_ROW,
    actorId: scope.kind === "actor" ? scope.id : undefined,
  },);
}

/**
 * Pick the cap that applies to a scope kind.
 *
 * @param scope
 * @param cfg
 * @returns the cap, or `null` for unbounded
 */
export function capFromConfig(
  scope: AutonomyScope,
  cfg: AutonomyConfig,
): number | null {
  return scope.kind === "actor" ? cfg.perAgentCap : cfg.perUserCap;
}
