// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/db.ts — re-export: single source databaseMeta in sections/database.ts
// DATA_DIR placeholder handling moved to the json-schema assembly boundary (index.ts).
import { databaseMeta, } from "../../sections/database";

export const db = databaseMeta;
