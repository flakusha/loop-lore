// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

export interface HandlerOpts {
  database: Kysely<DB>;
}

export interface MessageData {
  id: string;
  content: string;
  role: string;
  created_at: string;
  display_name: string | null;
  model_id: string | null;
  token_count_total: number | null;
}
