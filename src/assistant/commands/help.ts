// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { getCommandRequirement, listCommands, registerCommand, satisfiesRole, } from "./registry";

registerCommand("help", (_args, ctx,) => {
  const cmds = listCommands().filter((name,) => {
    const required = getCommandRequirement(name,);
    if (!required) { return true; }
    return ctx.roleInChat ? satisfiesRole(ctx.roleInChat, required,) : true;
  },);

  const lines = [
    "**Available Commands:**",
    "",
    ...Array.from(cmds, (c,) => `- \`/${c}\``,),
    "",
    "Type `/<command>` to execute. Use arrow keys or click to select from the palette.",
  ];

  return { systemMessage: lines.join("\n",), handled: true, };
},);
