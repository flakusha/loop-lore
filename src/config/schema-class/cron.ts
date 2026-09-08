// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/cron.ts — cron section defaults
import type { CronConfig, } from "../schema";

export const CRON_DEFAULTS = {
  enabled: true,
  jobs: {},
} satisfies CronConfig;
