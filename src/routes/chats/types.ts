// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";

/** Shared per-route options threaded into every chats sub-plugin. */
export interface HandlerOpts {
  database: Kysely<DB>;
  config: Config;
}
