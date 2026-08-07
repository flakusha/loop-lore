// Shared in-memory edit-history store.

import type { EditHistory, } from "../image-edit-commands";

/** In-memory edit histories (persists until server restart) */
export const editHistories = new Map<string, EditHistory>();
