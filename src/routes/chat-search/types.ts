// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { t, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";

export interface HandlerOpts {
  database: Kysely<DB>;
  config: Config;
}

// ── Validation Schemas ──────────────────────────────────────────

export const ChatSearchQuery = t.Object({
  q: t.Optional(t.String({ minLength: 1, maxLength: 200, },),),
  type: t.Optional(t.UnionEnum(["direct", "group",],),),
  world: t.Optional(t.String({ format: "uuid", },),),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50, default: 20, },),),
  offset: t.Optional(t.Numeric({ minimum: 0, default: 0, },),),
},);

export const JoinableQuery = t.Object({
  world: t.Optional(t.String({ format: "uuid", },),),
  location: t.Optional(t.String({ format: "uuid", },),),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50, default: 20, },),),
  offset: t.Optional(t.Numeric({ minimum: 0, default: 0, },),),
},);
