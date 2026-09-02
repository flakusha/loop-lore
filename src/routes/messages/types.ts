// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { AsyncStore, } from "../../async/store";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import type { Kysely, } from "kysely";

/** Shared per-route options threaded into every split sub-plugin. */
export interface HandlerOpts {
  database: Kysely<DB>;
  config: Config;
  /** Optional async request-result store; threaded through to routes that emit a requestId. */
  asyncStore?: AsyncStore;
}