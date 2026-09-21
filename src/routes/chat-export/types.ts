// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";

/** */
export interface HandlerOpts {
  database: Kysely<DB>;
  /** Optional config — required for the export to mirror the render-time
   *  transform pipeline. Test stubs and the legacy `{ database }` callers
   *  omit it; the route defaults to no transforms in that case. */
  config?: Config;
}

/** */
export interface MessageData {
  id: string;
  content: string;
  role: string;
  created_at: string;
  display_name: string | null;
  model_id: string | null;
  token_count_total: number | null;
}
