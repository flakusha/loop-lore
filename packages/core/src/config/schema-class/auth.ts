// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/auth.ts — re-export: single source in sections/auth.ts
// Sections copy is canonical: adds jwtSecret/csrfSecret/jwtExpiresIn/
// legacyOpaqueTokenFallback matching AuthConfig. Runtime gains those keys.
export { AUTH_DEFAULTS, } from "../sections/auth";
