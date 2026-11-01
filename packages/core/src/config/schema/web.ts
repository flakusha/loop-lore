// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/web.ts — Web editor / browser-terminal config types

import type { WebSection, } from "../sections/web";

/** */
export interface WebTerminalConfig {
  /** Master toggle for the browser-terminal route; the route refuses to start while false. */
  enabled: boolean;
  /** Permit non-localhost clients to open the PTY. */
  allowRemote: boolean;
}

export type WebConfig = InstanceType<typeof WebSection>;
