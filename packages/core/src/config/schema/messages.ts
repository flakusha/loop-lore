// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/messages.ts — Messages config type

/** */
import type { MessagesSection, } from "../sections/messages";

export type MessagesConfig = InstanceType<typeof MessagesSection>;
