// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * permission-failure.ts - the queue's typed failure codes.
 *
 * One structure feeds both the runtime values a failure carries and the type
 * they have, so the codes cannot drift from the union the queue answers with.
 */

/** The queue's failure codes - the runtime values a failure carries. */
export const PERMISSION_FAILURE = {
  unknownRequest: "unknown_request",
  noConnection: "no_connection",
  askGone: "ask_gone",
  refused: "refused",
  notDelivered: "not_delivered",
} as const;

/** One of the queue's failure codes. */
export type PermissionFailureCode = typeof PERMISSION_FAILURE[keyof typeof PERMISSION_FAILURE];
