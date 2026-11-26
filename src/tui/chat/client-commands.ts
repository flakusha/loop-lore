// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { dispatchBranchCommand, } from "./branch-commands";
import { dispatchCharacterCommand, } from "./characters-commands";
import type { ChatHost, } from "./types";

/**
 * Route the HTTP-backed slash commands away from the message send path.
 * @param host - chat widget host
 * @param text - trimmed input starting with `/`
 * @returns whether the text was a handled command
 */
export function routeClientCommand(host: ChatHost, text: string,): Promise<boolean> {
  if (text.startsWith("/chars",)) { return dispatchCharacterCommand(host, text,); }
  return dispatchBranchCommand(host, text,);
}
