// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/docs.ts — Documentation config type

/** */
import type { DocsSection, } from "../sections/docs";

export type DocumentationConfig = InstanceType<typeof DocsSection>;
