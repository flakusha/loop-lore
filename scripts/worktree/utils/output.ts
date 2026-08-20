// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Output formatting utilities
 */

import { isNoColor, } from "./colors";

export const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

export function colorize(text: string, color: keyof typeof colors,): string {
  if (isNoColor()) { return text; }
  return `${colors[color]}${text}${colors.reset}`;
}

export function log(
  level: "info" | "success" | "warn" | "error",
  message: string,
): void {
  const prefix = {
    info: colorize("\u2626", "cyan",),
    success: colorize("\u2713", "green",),
    warn: colorize("\u26a0️", "yellow",),
    error: colorize("\u2718", "red",),
  }[level];
  console.log(`${prefix} ${message}`,);
}

export function section(title: string,): void {
  console.log("",);
  console.log(colorize(`\u2551\u2551\u2551 ${title} \u2551\u2551\u2551`, "cyan",),);
  console.log("",);
}

export function indent(text: string, spaces = 2,): string {
  return " ".repeat(spaces,) + text;
}
