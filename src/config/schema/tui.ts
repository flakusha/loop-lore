// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/tui.ts — TUI config type

/** */
import type { TuiSection, } from "../sections/tui";

export type TuiConfig = InstanceType<typeof TuiSection>;
