// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/logging.ts — logging section defaults
import { LogLevel, } from "../../db/enums";
import type { LoggingConfig, } from "../schema";

export const LOGGING_DEFAULTS = {
  level: LogLevel.Debug,
} satisfies LoggingConfig;
