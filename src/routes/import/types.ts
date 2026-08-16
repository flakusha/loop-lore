// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { CanonicalCharacter, } from "../../characters/parser";
import type { DB, } from "../../db/schema";

export interface ImportActorOpts {
  character: CanonicalCharacter;
  format: string;
  warnings: string[];
  database: Kysely<DB>;
  userId: string;
  rawSource?: string;
  sourceFormat?: string;
  charxAssets?: { name: string; type: string; data: Buffer }[];
  uploadDir?: string;
}
