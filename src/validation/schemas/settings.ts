// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Settings route validation schema.
 *
 * Closed allowlist for PATCH /api/settings: any client-supplied key outside
 * `SettingsUpdateAllowedKeys` is rejected with 400 BAD_REQUEST, never silently
 * merged (BUG-patch-settings-endpoint-has-no-key-allowlist). TypeBox strips
 * unknown keys when `additionalProperties: false` is set on the body schema,
 * so the route layer performs its own key check before merging — the schema
 * here is documentation + shape-level validation; the runtime allowlist is
 * authoritative.
 */

import { t, } from "elysia";

// ── Settings update keys (closed allowlist) ─────────────────

/**
 * Frozen set of keys the PATCH /api/settings handler accepts. Add new
 * user-facing settings here, then describe the value in
 * `SettingsUpdateBody` below.
 */
export const SettingsUpdateAllowedKeys = [
  "theme",
  "fontSize",
  "locale",
  "provider",
  "apiEndpoint",
  "apiKey",
  "model",
  "temperature",
  "maxTokens",
  "detailLevel",
  "auto_rename_enabled",
  "displayName",
  "birthDate",
  "customInstructions",
  "notifications",
] as const;

/** */
export type SettingsUpdateKey = (typeof SettingsUpdateAllowedKeys)[number];

/**
 * Body schema for PATCH /api/settings — DOCUMENTATION ONLY. The route
 * cannot wire this in as its body schema because TypeBox's
 * `additionalProperties: false` strips unknown keys silently rather than
 * rejecting them; the runtime allowlist check in `handleUpdateSettings`
 * must see every key the client sent. Use this schema to document the
 * expected value shape and constraints for each allowed key — when adding
 * a new key, add it to `SettingsUpdateAllowedKeys` first, then mirror it
 * here.
 */
export const SettingsUpdateBody = t.Object(
  {
    theme: t.Optional(t.String({ maxLength: 128, },),),
    fontSize: t.Optional(t.Number({ minimum: 1, maximum: 1000, },),),
    locale: t.Optional(t.String({ maxLength: 32, },),),
    provider: t.Optional(t.String({ maxLength: 64, },),),
    apiEndpoint: t.Optional(t.String({ maxLength: 2048, },),),
    apiKey: t.Optional(t.String({ maxLength: 4096, },),),
    model: t.Optional(t.String({ maxLength: 256, },),),
    temperature: t.Optional(t.Number({ minimum: 0, maximum: 2, },),),
    maxTokens: t.Optional(t.Integer({ minimum: 1, maximum: 1_000_000, },),),
    detailLevel: t.Optional(
      t.UnionEnum(["Immersion", "Basic", "Detailed",],),
    ),
    auto_rename_enabled: t.Optional(t.Boolean(),),
    displayName: t.Optional(t.String({ maxLength: 128, },),),
    birthDate: t.Optional(t.String({ maxLength: 32, },),),
    customInstructions: t.Optional(
      t.Union([t.String({ maxLength: 5000, },), t.Null(),],),
    ),
    notifications: t.Optional(t.Record(t.String(), t.Unknown(),),),
  },
  { additionalProperties: false, },
);
