// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Auth middleware types.
 */
import type { Kysely, } from "kysely";
import type { AuthConfig, } from "../../config/schema";
import type { DB, } from "../../db/schema";

export interface AuthenticateOpts {
  request: Request;
  database: Kysely<DB>;
  authConfig: AuthConfig;
}
