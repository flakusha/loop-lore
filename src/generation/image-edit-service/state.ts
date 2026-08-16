// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Shared in-memory edit-history store.

import type { EditHistory, } from "../image-edit-commands";

/** In-memory edit histories (persists until server restart) */
export const editHistories = new Map<string, EditHistory>();
