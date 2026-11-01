// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/age-gate.ts — Age gate / verification config type

import type { AgeGateSection, } from "../sections/age-gate";

export type AgeGateConfig = InstanceType<typeof AgeGateSection>;
