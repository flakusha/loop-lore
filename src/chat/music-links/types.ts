// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Music link service types. */
import type { MusicService, } from "../../validation/schemas/music-links";

/** */
export interface MusicLinkConfig {
  nsfwFilterEnabled: boolean;
}

/** */
export interface MusicMetadata {
  title: string;
  artist: string;
  thumbnailUrl: string | null;
  durationSecs: number | null;
  serviceTrackId: string;
  serviceUrl: string;
  isPlaylist: boolean;
  trackCount: number | null;
  explicit: boolean;
  year: number | null;
  genre: string | null;
}

/** */
export interface StoreParams {
  chatId: string;
  senderId: string;
  sectionId?: string | null;
  url: string;
  service: MusicService;
  metadata: MusicMetadata;
  embedHtml: string | null;
}

/** */
export interface MusicLinkRow {
  id: string;
  chat_id: string;
  section_id: string | null;
  sender_id: string;
  service: string;
  url: string;
  embed_html: string | null;
  title: string;
  artist: string;
  thumbnail_url: string | null;
  duration_secs: number | null;
  service_track_id: string;
  service_url: string;
  is_playlist: number;
  track_count: number | null;
  explicit: number;
  year: number | null;
  genre: string | null;
  nsfw_hidden: number;
  created_at: string;
}
