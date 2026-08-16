// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generation Route barrel — re-exports the full public surface of the former
 * src/generation/generate-route.ts so all existing import sites keep working.
 *
 * Public surface preserved:
 *   - handleGenerate, HandleGenerateOpts
 *   - GenerateRequest
 *   - gatePluginToolsByRole
 */

export { handleGenerate, } from "./handler";
export type { HandleGenerateOpts, } from "./handler";
export { gatePluginToolsByRole, } from "./tool-execution";
export type { GenerateRequest, } from "./types";
