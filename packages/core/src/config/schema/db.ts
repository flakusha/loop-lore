// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/db.ts — Database config type
//
// Exported publicly as `DbConfig` to preserve the original public surface.

import type { DatabaseSection, } from "../sections/database";

export type DbConfig = InstanceType<typeof DatabaseSection>;
