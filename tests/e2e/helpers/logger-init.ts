// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { createLogger, setGlobalLogger, } from "@/logger";

// Ensure a global logger exists before the app server module graph loads.
// Some app modules (e.g. src/group-chat/*) call getLogger() at module scope,
// which throws "Logger not initialized" if the global logger isn't set yet.
// Importing this module first guarantees the logger is present at e2e startup.
setGlobalLogger(createLogger({ level: "error", },),);
