// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { joinRoutes, } from "./join";
import { joinableRoutes, } from "./joinable";
import { transferRoutes, } from "./transfer";
import type { HandlerOpts, } from "./types";

/**
 * Chat membership facade — joinable discovery, joining, and location transfer.
 * @param opts
 * @param prefix
 * @returns {Elysia}
 */
export function chatMembershipRoutes(opts: HandlerOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "chat-membership", },)
      .use(joinableRoutes(opts, prefix,),)
      .use(joinRoutes(opts, prefix,),)
      .use(transferRoutes(opts, prefix,),)
  );
}
