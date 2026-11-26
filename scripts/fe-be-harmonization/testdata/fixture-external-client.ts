// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Fixture external client for external-calls.test.ts. NOT imported anywhere —
 * its call-shaped string literals are extracted by the scanner directly, so it
 * must look like a real external caller (one contract-breaking call, one
 * matching call, one path-param call).
 */

function postLike(path: string,): string {
  return path;
}
function getLike(path: string,): string {
  return path;
}

/** Breaks the published contract: path does not exist in the OpenAPI doc. */
export function fixtureBadCall(): string {
  return postLike(`/api/v1/definitely/not/a/route`,);
}

/** Matches the published contract: GET /api/v1/chats/{id}/messages. */
export function fixtureGoodCall(chatId: string,): string {
  return getLike(`/api/v1/chats/${chatId}/messages`,);
}

/** Path-param normalization: ${chatId} must match spec {chatId}. */
export function fixtureParamCall(chatId: string,): string {
  return getLike(`/api/v1/chats/${chatId}/branch-merges`,);
}
