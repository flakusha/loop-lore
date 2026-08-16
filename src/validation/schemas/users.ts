// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * User route validation schemas.
 */

import { t, } from "elysia";
import { DisplayName, Id, } from "./primitives";

// ── User routes ────────────────────────────────────────────

export const UserProfileUpdateBody = t.Object({
  displayName: t.Optional(DisplayName,),
  birthDate: t.Optional(t.String(),),
  settings: t.Optional(t.Any(),),
},);

export const UserIdParams = t.Object({
  id: Id,
},);
