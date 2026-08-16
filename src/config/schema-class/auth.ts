// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/auth.ts — auth section defaults
import type { AuthConfig, } from "../schema";

export const AUTH_DEFAULTS = {
  required: false,
  registrationOpen: true,
  sessionTimeoutHours: 24,
  maxSessionsPerUser: 10,
  demoUsername: "demo",
  demoAutoSetup: true,
  adminUsername: "",
  adminPassword: "",
} satisfies AuthConfig;
