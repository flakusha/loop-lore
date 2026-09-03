// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/generation.ts — generation JSON Schema section.
//
// SINGLE SOURCE OF TRUTH: re-export the canonical generation meta from
// src/config/sections/generation/meta.ts (which composes llamaCppMeta +
// sdCppMeta). Adding a new generation config field only requires editing
// src/config/sections/generation/{meta,llama,sd}.ts; this file used to
// mirror the structure and was deduplicated via re-export (jscpd gate:
// -2 clones, -122 dup lines). See
// .plan/tickets/TASK-single-source-of-truth-for-config-schema-mirrors.md
// (D3).

import { generationMeta, } from "../../sections/generation/meta.js";

export const generation = generationMeta;
