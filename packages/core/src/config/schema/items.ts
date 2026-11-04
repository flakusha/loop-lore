// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/items.ts — Items (template seeding) config type

import type { ItemsSection, } from "../sections/items/section";

export type ItemsConfig = InstanceType<typeof ItemsSection>;
