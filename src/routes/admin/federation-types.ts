// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The one options object every federation admin route receives. Declared in its
 * own module so the peer, budget/matrix and usage routers can each stay under
 * the 250-line budget without importing one another.
 */

import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import type { PeerProbeFetch, } from "../../federation/peer-health-probe";

/** Construction options for the federation admin surface. */
export interface AdminFederationRouteOpts {
  readonly database: Kysely<DB>;
  readonly config: Config;
  /** `config.federation.enabled`, read once at construction. Federation is off by
   * default, so this is false on a stock instance and every route refuses. */
  readonly federationEnabled: boolean;
  /** `config.byoKey.encryptionKey` — the secret the shared token is encrypted with. */
  readonly encryptionKey: string;
  /** Test seam for the save-time health probe. Omitted in production, where the
   * probe uses the platform fetch. */
  readonly probeFetch?: PeerProbeFetch;
}
