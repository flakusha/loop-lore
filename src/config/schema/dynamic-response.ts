// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/dynamic-response.ts — Dynamic-response optimization config type

import type { DynamicResponseSection, } from "../sections/dynamic-response";

export type DynamicResponseConfig = InstanceType<typeof DynamicResponseSection>;
