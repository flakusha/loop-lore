// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { start, } from "./start";
export { createRequestHandler, handleApiRequest, } from "./handler";
export type { HandleApiRequestOpts, } from "./handler";
export { start, } from "./start";

// Only auto-start when executed directly (not imported by tests)
// Bun equivalent of `require.main === module`
const isMainModule = typeof Bun !== "undefined" && (Bun as { main?: string }).main === import.meta.path;
if (isMainModule) {
  await start();
}
