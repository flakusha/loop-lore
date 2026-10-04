// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/logging.ts — Logging config type

import type { LoggingSection, } from "../sections/logging";

export type LoggingConfig = InstanceType<typeof LoggingSection>;
