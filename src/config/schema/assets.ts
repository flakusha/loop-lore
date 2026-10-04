// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/assets.ts — Asset storage config type

/** */
import type { AssetsSection, } from "../sections/assets";

export type AssetsConfig = InstanceType<typeof AssetsSection>;
