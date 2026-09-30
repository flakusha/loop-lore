// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { DETAIL_LABELS, MODE_LABELS, } from "./types";

export const formatting = {
  // ── Formatters ──────────────────────────────────────

  /**
   * @param {string} detail
   * @returns {string}
   */
  formatDetail(detail: string,): string {
    return DETAIL_LABELS[detail] ?? detail;
  },

  /**
   * @param {string} mode
   * @returns {string}
   */
  formatMode(mode: string,): string {
    return MODE_LABELS[mode] ?? mode;
  },
};
