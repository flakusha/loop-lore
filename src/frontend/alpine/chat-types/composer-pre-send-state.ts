// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ComposerPreSendState as RuntimeState, } from "../composer-pre-send";
import type { AlpineMagicThis, } from "../types";

/**
 * Composer pre-send state shape (TASK-chat-feature-entry-field-pre-send).
 *
 * Fields/methods are sourced from `composer-pre-send.ts` so the type-level
 * `ChatState` aggregate picks them up via interface extension below.
 */
export interface ChatComposerPreSendState extends AlpineMagicThis, RuntimeState {}
