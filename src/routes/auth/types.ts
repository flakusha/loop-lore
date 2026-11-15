// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import type { MessageBridge, } from "../../integrations/bridge";
import type { RateLimiter, } from "../../middleware/rate-limit";

/**
 * Optional per-route limiter overrides. Production callers omit them (module
 * singletons in shared.ts apply); tests inject isolated instances so parallel
 * files never share mutable limiter state.
 */
export interface LimiterOverrides {
  loginLimiter?: RateLimiter;
  registerLimiter?: RateLimiter;
  demoLoginLimiter?: RateLimiter;
  verifyLimiter?: RateLimiter;
}

/** */
export interface HandleOpts {
  database: Kysely<DB>;
  config: Config;
  /** Delivery bridge for code-sending routes; undefined means unconfigured (503). */
  bridge?: MessageBridge;
  /** Optional limiter overrides (tests); defaults to shared module singletons. */
  limiters?: LimiterOverrides;
}
