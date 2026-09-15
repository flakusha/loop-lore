// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/assistant.ts — re-export: single source assistantMeta in sections/assistant.ts
// Meta is canonical: includes travelPrompts missing from the old mirror.
import { assistantMeta, } from "../../sections/assistant";

export const assistant = assistantMeta;
