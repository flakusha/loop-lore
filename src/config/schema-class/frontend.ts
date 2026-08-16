// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/frontend.ts — frontend section defaults
import type { FrontendConfig, } from "../schema";

export const FRONTEND_DEFAULTS = {
  mode: "htmx" as const,
} satisfies FrontendConfig;
