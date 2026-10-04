// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/assistant.ts — Assistant config type

/** */
import type { AssistantSection, } from "../sections/assistant";

export type AssistantConfig = InstanceType<typeof AssistantSection>;
