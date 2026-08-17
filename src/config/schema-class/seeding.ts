// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/seeding.ts — seeding section defaults
import type { SeedingConfig, } from "../schema";

export const SEEDING_DEFAULTS = {
  enabled: false,
  users: [],
} satisfies SeedingConfig;
