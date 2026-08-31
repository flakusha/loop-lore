// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { downloadRoutes, } from "./download";
import { startRoutes, } from "./start";
import { statusRoutes, } from "./status";
import type { HandlerOpts, } from "./types";

/**
 * @param root0
 * @param root0.database
 */
export function exportSseRoutes({ database, }: HandlerOpts,): Elysia {
  return new Elysia({ name: "export-sse", },)
    .use(startRoutes({ database, },),)
    .use(downloadRoutes({ database, },),)
    .use(statusRoutes({ database, },),);
}
