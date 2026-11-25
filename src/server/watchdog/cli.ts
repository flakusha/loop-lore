// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** `bun run watchdog` — supervise the loop-lore server process. */

import { runWatchdogSupervisor, } from "./boot";

const exitCode = await runWatchdogSupervisor();
process.exit(exitCode,);
