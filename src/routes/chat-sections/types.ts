// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { t, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";

/** */
export interface HandlerOpts {
  database: Kysely<DB>;
  config: Config;
}

export const NullableStringSchema = t.Union([t.String(), t.Null(),],);
export const OptionalNullableString = t.Optional(NullableStringSchema,);

export const ChatSectionCreateBody = t.Object({
  label: t.String(),
  description: t.Optional(t.String(),),
  locationId: OptionalNullableString,
},);
export const ChatSectionUpdateBody = t.Object({
  label: t.Optional(t.String(),),
  description: t.Optional(t.String(),),
  locationId: OptionalNullableString,
},);
export const ChatSectionReorderBody = t.Object({ sectionIds: t.Array(t.String(),), },);
export const MessageSectionAssignBody = t.Object({ sectionId: NullableStringSchema, },);
export const MessageSectionAssignResponse = t.Object({ ok: t.Boolean(), section_id: NullableStringSchema, },);
