// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/transport.ts — re-export: single source in sections/transport.ts
// Nested COMPRESSION/LIMITS consts re-exported for compat (sections barrel owns them).
export {
  TRANSPORT_COMPRESSION_DEFAULTS,
  TRANSPORT_DEFAULTS,
  TRANSPORT_LIMITS_DEFAULTS,
} from "../sections/transport";
