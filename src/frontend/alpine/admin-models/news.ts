// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { log, } from "./shared";
import type { ModelsState, } from "./types";

/** One feed family as returned by GET /api/admin/model-news. */
export interface NewsFamily {
  family: string;
  refreshedAt: string | null;
  items: { id: string; title: string; url: string | null; publishedAt: string | null; author: string | null }[];
}

export const newsState: Partial<ModelsState> & ThisType<ModelsState> = {
  modelNews: [] as NewsFamily[],
  loadingNews: false,

  /**
   * @returns {Promise<void>}
   */
  async loadModelNews() {
    this.loadingNews = true;
    try {
      const res = await apiFetch("/api/v1/admin/model-news", {
        headers: { Accept: "application/json", },
      },);

      if (res.ok) {
        const data = await res.json();
        this.modelNews = data.families || [];
      }
    } catch {
      log.warn("Network error loading model news",);
    } finally {
      this.loadingNews = false;
    }
  },
  /**
   * @returns {Promise<void>}
   */
  async refreshModelNews() {
    this.loadingNews = true;
    try {
      const res = await apiFetch("/api/v1/admin/model-news/refresh", {
        method: "POST",
        headers: { Accept: "application/json", },
      },);

      if (res.ok) {
        const data = await res.json();
        this.modelNews = data.families || [];
      }
    } catch {
      log.warn("Network error refreshing model news",);
    } finally {
      this.loadingNews = false;
    }
  },
};
