// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/headers.ts — headers section defaults, composed from
// the single source in sections/headers.ts. The spread keeps per-instance
// isolation for nested mutable structures (factory deepClone covers it too).
import type { HeadersConfig, } from "../schema";
import { CSP_DEFAULTS, HEADERS_DEFAULTS, } from "../sections/headers";

export const HEADERS_SECTION_DEFAULTS = {
  ...HEADERS_DEFAULTS,
  csp: { ...CSP_DEFAULTS, },
  linkPreload: [...HEADERS_DEFAULTS.linkPreload,],
  earlyHints: { ...HEADERS_DEFAULTS.earlyHints, },
} satisfies HeadersConfig;
