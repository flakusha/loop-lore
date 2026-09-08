// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/federation.ts — federation section defaults
import type { FederationConfig, } from "../schema";

export const FEDERATION_DEFAULTS = {
  enabled: false,
  seeds: [],
  peers: [],
} satisfies FederationConfig;
