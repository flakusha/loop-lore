#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Worktree management CLI — mjs entry point
 *
 * Delegates ALL commands to the TypeScript dispatcher (index.ts).
 * Commands listed in index.ts are handled there; anything unknown
 * is forwarded to index.ts (which shows help).
 */

import { main, } from "./index.ts";

await main();
