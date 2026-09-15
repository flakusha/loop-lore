// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/auth.ts — re-export: single source authMeta in sections/auth.ts
// Meta is canonical: includes jwtSecret/csrfSecret/jwtExpiresIn missing from the old mirror.
import { authMeta, } from "../../sections/auth";

export const auth = authMeta;
