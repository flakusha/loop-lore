// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** A music link row returned by the music-links API. */
export interface MusicLinkRow {
  id: string;
  chatId: string;
  service: string;
  url: string;
  embedHtml: string | null;
  title: string;
  artist: string;
  thumbnailUrl: string | null;
  durationSecs: number | null;
  serviceTrackId: string;
  serviceUrl: string;
  isPlaylist: boolean;
  trackCount: number | null;
  explicit: boolean;
  nsfwHidden: boolean;
  createdAt: string;
}

/** Chat music links state (list / add / delete). */
export interface ChatMusicLinksState {
  _musicLinks: MusicLinkRow[];
  _musicLinksLoading: boolean;
  _musicLinksConfirmDelete: string | null;
  _musicLinkUrl: string;
  _musicLinkError: string;
  _musicLinkSaving: boolean;
  toggleMusicLinksPanel(): void;
  loadMusicLinks(): Promise<void>;
  addMusicLink(): Promise<void>;
  confirmDeleteMusicLink(id: string,): void;
  deleteMusicLink(id: string,): Promise<void>;
}
