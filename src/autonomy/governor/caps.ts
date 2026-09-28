// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/autonomy/governor/caps.ts — cap resolution for a governor scope
//
// Actor-scoped consumes read `AutonomyConfig.perAgentCap`; user-scoped
// consumes read `perUserCap`. `null` means unbounded — the governor then
// skips the DB entirely and always allows.

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { resolveAutonomyConfig, } from "../config";
import type { AutonomyConfig, } from "../config";
import type { AutonomyScope, TryConsumeOptions, } from "./types";

/** Sentinel used when the caller supplies no chat context. The config
 *  resolver needs a chat row; the returned caps are unused on that path
 *  because the caller passed an explicit cap.
 */
const NO_CHAT = "__none__";

/**
 * Resolve the cap for a scope/limit from the layered autonomy config.
 *
 * - actor scopes use `perAgentCap`
 * - user scopes use `perUserCap`
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
  return resolveAutonomyConfig(db, {
    worldId: NO_CHAT,
    chatId: opts.chatId ?? NO_CHAT,
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
