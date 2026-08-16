// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Config, } from "../../config/schema";
import type { Db, } from "../../db";

/** Shared per-route options threaded into every split sub-plugin. */
export interface AdminRouteOpts {
  database: Db;
  config: Config;
}
