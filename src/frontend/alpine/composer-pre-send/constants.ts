// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** How long a draft is allowed to live before being discarded on restore. */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** `localStorage` key namespace for composer drafts. */
export const DRAFT_STORAGE_KEY = "ll-composer-draft-v1";
