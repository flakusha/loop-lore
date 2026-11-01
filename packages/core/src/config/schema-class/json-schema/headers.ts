// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/headers.ts — re-export: single source headersMeta in sections/headers.ts
// Meta now derives every default from HEADERS/CSP_DEFAULTS (incl. hsts, added here).
import { headersMeta, } from "../../sections/headers";

export const headers = headersMeta;
