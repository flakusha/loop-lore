// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/logging.ts — re-export: single source loggingMeta in sections/logging.ts
// Meta is canonical: no invented numeric defaults (the old mirror hardcoded
// jsonl/queue/limit numbers that match nothing in LoggingConfig or logger/limits.ts;
// those fields are optional overrides, undefined unless set).
import { loggingMeta, } from "../../sections/logging";

export const logging = loggingMeta;
