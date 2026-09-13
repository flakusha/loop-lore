// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** One provider result as returned by GET /api/gifs/search. */
export interface GifResult {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
}

/** GIF picker slice of chat state (merge into ChatState on registration). */
export interface GifPickerState {
  _gifOpen: boolean;
  _gifQuery: string;
  _gifResults: GifResult[];
  _gifActiveIndex: number;
  _gifLoading: boolean;
  openGifPicker(): void;
  closeGifPicker(): void;
  toggleGifPicker(): void;
  searchGifs(): Promise<void>;
  moveGifSelection(delta: 1 | -1,): void;
  handleGifKey(event: KeyboardEvent,): void;
  insertGifAtIndex(index: number,): Promise<void>;
  insertGif(result: GifResult,): Promise<void>;
}
