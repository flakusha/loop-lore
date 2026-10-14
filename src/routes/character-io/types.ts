// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { HostResolver, } from "../../utils/url-validation";

/**
 * Shared per-route options threaded into every character-io sub-plugin.
 */
export interface HandlerOpts {
  database: Kysely<DB>;
  /** DNS resolver used by the URL-import SSRF guard. Test seam; defaults to node:dns. */
  resolveHost?: HostResolver;
}
