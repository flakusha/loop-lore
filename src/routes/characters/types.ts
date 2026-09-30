// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { linkAsset as LinkAssetFn, } from "../../assets/service/links";
import type { DB, } from "../../db/schema";

/** Shared per-route options threaded into every split sub-plugin. */
export interface HandlerOpts {
  database: Kysely<DB>;
  /**
   * Test seam for the asset-link writer. Defaults to the real implementation.
   * Injected rather than `mock.module`d because Bun's module registry is
   * process-global and has no unmock, so a module mock here silently disabled
   * attachment linking in every later test file of the run.
   */
  linkAsset?: typeof LinkAssetFn;
}
