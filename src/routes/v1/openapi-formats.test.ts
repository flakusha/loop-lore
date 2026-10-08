// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { FormatRegistry, } from "@sinclair/typebox";
import { describe, expect, test, } from "bun:test";
import "./openapi";

// Version nibble `0`, variant nibble `0`: Elysia's canonical `uuid` format is a
// pure shape regex and accepts it; the valibot-strict `uuid` that
// `@elysia/openapi` force-registers at module load rejects it. Every route
// schema (`Id` / `OptionalId` / `ChatIdParams`) was authored against the
// canonical shape, so without the `fullFormats` re-apply in `./openapi` this id
// would start 400-ing at runtime once the v1 barrel is loaded at server boot.
// The barrel imports this module via `admin-surface.ts`, so importing the
// module here reproduces the same process-global registry state.
const LOOSE_UUID = "550e8400-e29b-00d4-0716-446655440000";

describe("openapi import restores Elysia canonical formats", () => {
  test("FormatRegistry uuid still accepts a version-0 / variant-0 uuid", () => {
    const uuid = FormatRegistry.Get("uuid",);

    expect(uuid,).toBeDefined();
    expect(uuid?.(LOOSE_UUID,),).toBe(true,);
  });
});
