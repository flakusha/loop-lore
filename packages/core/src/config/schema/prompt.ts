// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/prompt.ts — Prompt budget config types

import type { PromptSection, } from "../sections/prompt";

export type PromptConfig = InstanceType<typeof PromptSection>;
