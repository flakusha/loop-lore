// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Color output utilities for terminal
 */
export const Colors = {
  RED: "\x1b[0;31m",
  GREEN: "\x1b[0;32m",
  YELLOW: "\x1b[1;33m",
  CYAN: "\x1b[0;36m",
  NC: "\x1b[0m", // No Color
} as const;

export function colorize(text: string, color: keyof typeof Colors,): string {
  return `${Colors[color]}${text}${Colors.NC}`;
}

export function error(message: string,): string {
  return colorize(message, "RED",);
}

export function success(message: string,): string {
  return colorize(message, "GREEN",);
}

export function warning(message: string,): string {
  return colorize(message, "YELLOW",);
}

export function info(message: string,): string {
  return colorize(message, "CYAN",);
}
