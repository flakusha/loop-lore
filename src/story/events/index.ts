// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Events Module — Barrel
 *
 * Story event extraction, validation, and application.
 */
export { applyEvents, } from "./application";
export type { AppliedEvent, } from "./application";
export type { ApplyEventsOpts, } from "./application";
export { extractEvents, } from "./extraction";
export type { ExtractEventsOpts, } from "./extraction";
export { validateEvents, } from "./validation";
export type { ValidationResult, } from "./validation";
export type { ValidateEventsOpts, } from "./validation";
