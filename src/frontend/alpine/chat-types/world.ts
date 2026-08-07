/** One channel chat row returned by GET /api/worlds/:worldId/chats. */
export interface WorldChannelChat {
  id: string;
  name: string;
  current_location_id: string | null;
  location_name: string | null;
}
