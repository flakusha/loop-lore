// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * API keys route validation schemas.
 */

import { t, } from "elysia";

// ── API keys schemas ──────────────────────────────────────

export const ApiKeyCreateBody = t.Object({
  name: t.String({ minLength: 1, },),
  provider: t.String({ minLength: 1, },),
  // Constrain to printable-ASCII and a sane length so a malformed client value
  // cannot be encrypted+stored and later sent verbatim to a provider. Real
  // keys are ASCII (sk-…, AIza…, etc.). Control chars / non-ASCII / >512
  // bytes are rejected before encryption.
  api_key: t.String({
    minLength: 1,
    maxLength: 512,
    pattern: "^[\\x20-\\x7e]+$",
  },),
},);
