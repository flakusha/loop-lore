import { DETAIL_LABELS, MODE_LABELS, } from "./types";

export const formatting = {
  // ── Formatters ──────────────────────────────────────

  formatDetail(detail: string,): string {
    return DETAIL_LABELS[detail] ?? detail;
  },

  formatMode(mode: string,): string {
    return MODE_LABELS[mode] ?? mode;
  },
};
