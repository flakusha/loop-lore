// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/characters.ts — Characters (template seeding) config type

import type { CharactersSection, } from "../sections/characters/section";

export type CharactersConfig = InstanceType<typeof CharactersSection>;
