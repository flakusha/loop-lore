// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Commit-message input extraction shared by `commit` and `agent-commit`.
 *
 * Supports `-F <path>` / `--message-file <path>` (use `-` for stdin) and
 * piped stdin, so multi-line messages reach `git commit -m` without
 * shell-argument mangling. Positional args are returned with the message
 * flags removed so callers keep their own positional parsing.
 */

import { log, } from "./output";

export interface MessageInput {
  /** Positional args with `-F`/`--message-file` and its value removed. */
  rest: string[];
  /** Message from `-F`/stdin, or null when no message input was given. */
  message: string | null;
}

/**
 * Scan `args` for message-file input.
 *
 * Resolution order: explicit `-F <path>` / `--message-file <path>` (path `-`
 * reads stdin); otherwise, when no positional args remain and stdin is a
 * pipe, stdin is consumed as the message. Errors and exits on a missing or
 * unreadable message file.
 *
 * @param args - raw command arguments
 * @returns remaining positional args and the resolved message (or null)
 */
export async function extractMessageInput(args: string[],): Promise<MessageInput> {
  const rest: string[] = [];
  let filePath: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-F" || arg === "--message-file") {
      const value = args[++i];
      if (value === undefined) {
        log("error", `${arg} requires a file path (or "-" for stdin)`,);
        process.exit(1,);
      }
      filePath = value;
    } else {
      rest.push(arg,);
    }
  }

  if (filePath !== null) {
    if (filePath === "-") {
      return { message: await Bun.stdin.text(), rest, };
    }
    const file = Bun.file(filePath,);
    if (!(await file.exists())) {
      log("error", `message file not found: ${filePath}`,);
      process.exit(1,);
    }
    return { message: await file.text(), rest, };
  }

  if (rest.length === 0 && !process.stdin.isTTY) {
    const text = await Bun.stdin.text();
    if (text.trim().length > 0) {
      return { message: text, rest, };
    }
  }

  return { message: null, rest, };
}
