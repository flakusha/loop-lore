// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { joinRoutes, } from "./join";
import { joinableRoutes, } from "./joinable";
import { searchRoutes, } from "./search";
import { transferRoutes, } from "./transfer";
import type { HandlerOpts, } from "./types";

/**
 * Chat search facade — barrel assembling the HTTP surface from domain
 * sub-plugins. Registration point/name (`chat-search`) is preserved so the
 * `register-plugins.ts` wiring is unchanged.
 */
export function chatSearchRoutes(opts: HandlerOpts,) {
  return (
    new Elysia({ name: "chat-search", },)
      .use(searchRoutes(opts,),)
      .use(joinableRoutes(opts,),)
      .use(joinRoutes(opts,),)
      .use(transferRoutes(opts,),)
  );
}
