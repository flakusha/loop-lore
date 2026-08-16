// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/headers.ts — headers section defaults
import type { HeadersConfig, } from "../schema";
import { CSP_DEFAULTS, HEADERS_DEFAULTS, } from "../sections/headers";

export const HEADERS_SECTION_DEFAULTS = {
  ...HEADERS_DEFAULTS,
  // Copy nested mutable structures so each instance stays isolated.
  csp: { ...CSP_DEFAULTS, },
  linkPreload: [...HEADERS_DEFAULTS.linkPreload,],
  earlyHints: { ...HEADERS_DEFAULTS.earlyHints, },
} satisfies HeadersConfig;
