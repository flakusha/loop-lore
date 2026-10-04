// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/nsfw.ts — NSFW content gating config type

/** */
import type { NsfwSection, } from "../sections/nsfw";

export type NsfwConfig = InstanceType<typeof NsfwSection>;
