// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/byo-key.ts — BYO API key config type

/** */
import type { ByoKeySection, } from "../sections/byo-key";

export type ByoKeyConfig = InstanceType<typeof ByoKeySection>;
