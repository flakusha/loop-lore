// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat backgrounds — shared schemas.
 */
import { t, } from "elysia";

export const BACKGROUND_TYPES = ["static", "parallax", "animated", "video", "particle",];

export const OptionalNullableString = t.Optional(t.Union([t.String(), t.Null(),],),);

export const ChatBackgroundCreateBody = t.Object({
  name: t.String(),
  type: t.Optional(t.String(),),
  locationId: OptionalNullableString,
  assetId: OptionalNullableString,
  config: OptionalNullableString,
  priority: t.Optional(t.Number(),),
},);
