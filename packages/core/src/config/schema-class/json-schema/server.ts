// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/server.ts — re-export: single source serverMeta in sections/server.ts
// DATA_DIR placeholder handling moved to the json-schema assembly boundary (index.ts).
import { serverMeta, } from "../../sections/server";

export const server = serverMeta;
