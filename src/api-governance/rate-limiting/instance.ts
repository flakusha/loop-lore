// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Process-wide governance limiter (one per server process). */
import { GovernanceRateLimiter, } from "./limiter";

/** */
export const governanceRateLimiter = new GovernanceRateLimiter();
