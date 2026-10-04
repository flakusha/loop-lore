// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/auth.ts — Authentication / session config type

/** */
import type { AuthSection, } from "../sections/auth";

export type AuthConfig = InstanceType<typeof AuthSection>;
