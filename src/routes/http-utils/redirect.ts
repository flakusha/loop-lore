// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 302 redirect helper (module scope — no closure capture).
 * @param location
 */
export const redirectTo = (location: string,): Response =>
  new Response(null, { status: 302, headers: { Location: location, }, },);
