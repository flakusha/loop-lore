// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Message search - shared route options type.
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";

/** */
export interface HandlerOpts {
  database: Kysely<DB>;
  /** Optional config — required for search results to mirror the render-time
   *  transform pipeline. Test stubs omit it; the route defaults to no
   *  transforms in that case. */
  config?: Config;
}
