// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { getLogger, type Logger, } from "../../logger/index.js";

/** */
export function log(): Logger {
  return getLogger().child({ module: "rpg-service", },);
}
