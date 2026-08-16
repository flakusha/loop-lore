// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** One channel chat row returned by GET /api/worlds/:worldId/chats. */
export interface WorldChannelChat {
  id: string;
  name: string;
  current_location_id: string | null;
  location_name: string | null;
}
