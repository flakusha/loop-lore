// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Logger, } from "../../logger";
import { getRpgLog, } from "../../rpg/shared/rpg-service-utils";

/** */
export function log(): Logger {
  return getRpgLog("rpg-routes",);
}
