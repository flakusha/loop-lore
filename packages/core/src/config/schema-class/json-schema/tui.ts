// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/tui.ts — re-export: single source tuiMeta in sections/tui.ts
// Meta is canonical: includes sessionToken missing from the old mirror.
import { tuiMeta, } from "../../sections/tui";

export const tui = tuiMeta;
