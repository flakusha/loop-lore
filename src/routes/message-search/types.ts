// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Message search - shared route options type.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

export interface HandlerOpts {
  database: Kysely<DB>;
}
