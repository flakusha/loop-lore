// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * User routes — shared options type.
 */
import type { Config, } from "../../config/schema";
import type { Db, } from "../../db";

export interface UsersRoutesOpts {
  database: Db;
  config: Config;
}
